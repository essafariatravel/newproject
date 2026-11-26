import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireAgencyUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { applications, applicants, statuses, visaTypes, countries, visaCategories } from "@/db/schema";
import { getBalance } from "@/lib/wallet";
import { AppError } from "@/lib/types";
import { submitVisaRequest,coalesceVisaSubmission,listRequirementsForVisaType } from "@/lib/requests";
import { stageRequestUpload, resolveRequestUploads, clearRequestUploads } from "@/lib/request-uploads";
import { requestErrorMessage } from "@/lib/request-feedback";
import { getUiLocale, UI_LOCALE_COOKIE } from "@/lib/ui-i18n";
import { bookingCatalogueFingerprint } from "@/lib/booking-catalogue-fingerprint";
import { readRequestBodyLimited } from "@/lib/http-body";

export const runtime = "nodejs";
const submission = z.object({ locale: z.enum(["en","fr","ar"]).optional(), attempt: z.string().uuid(), visaTypeId: z.string().uuid(), countryId: z.string().uuid(),
  fullName: z.string().max(200), nationality: z.string().max(80), notes: z.string().max(1000), tokens: z.array(z.string()).max(60), expectedFee: z.string().max(32).regex(/^\d+(?:\.\d+)?$/).optional(), expectedCatalogue: z.string().regex(/^[a-f0-9]{64}$/).optional() });
const preflight = z.object({ expectedCatalogue:z.string().regex(/^[a-f0-9]{64}$/).optional(), action: z.literal("preflight"), visaTypeId: z.string().uuid(), countryId: z.string().uuid(), fullName: z.string().trim().min(1).max(200), nationality: z.string().trim().min(1).max(80) });

export async function POST(request: Request) {
  try {
    // Session cookies alone do not authorize a cross-site mutation.
    if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const actor = await requireAgencyUser();
    const maxBodyBytes = 3 * 1024 * 1024;
    if (Number(request.headers.get("content-length") ?? 0) > maxBodyBytes) throw new AppError("FILE_TOO_LARGE", "Files must be 2 MB or smaller.");
    // Content-Length is only an early reject. The streamed cap remains authoritative
    // for chunked or forged-length requests.
    const rawBody = await readRequestBodyLimited(request, maxBodyBytes);
    const replay = new Request(request.url, { method: "POST", headers: request.headers, body: new Uint8Array(rawBody) });
    if (request.headers.get("content-type")?.startsWith("multipart/form-data")) {
      const form = await replay.formData(), file = form.get("file");
      if (!(file instanceof File)) throw new AppError("EMPTY_FILE", "Choose a file.");
      const token = await stageRequestUpload({ actor, attempt: String(form.get("attempt")), visaTypeId: String(form.get("visaTypeId")),
        documentTypeId: String(form.get("documentTypeId")), slot: Number(form.get("slot")),
        file: { name: file.name, type: file.type, size: file.size, data: Buffer.from(await file.arrayBuffer()) } });
      return NextResponse.json({ token }, { headers: { "Cache-Control": "no-store" } });
    }
    let json: unknown;
    try {
      json = JSON.parse(rawBody.toString("utf8"));
    } catch {
      throw new AppError("VALIDATION", "Invalid request.");
    }
    if (typeof json === "object" && json !== null && "action" in json && json.action === "preflight") {
      const input = preflight.parse(json);
      const [programmes, wallet, matching, requirements] = await Promise.all([
        db.select({fee:visaTypes.fee,minDays:visaTypes.processingMinDays,maxDays:visaTypes.processingMaxDays}).from(visaTypes)
          .innerJoin(countries,eq(visaTypes.countryId,countries.id))
          .innerJoin(visaCategories,eq(visaTypes.categoryId,visaCategories.id))
          .where(and(eq(visaTypes.id,input.visaTypeId),eq(visaTypes.countryId,input.countryId),eq(visaTypes.active,true),eq(countries.active,true),eq(visaCategories.active,true),eq(visaTypes.currency,"DZD"))).limit(1),
        getBalance(actor.agencyId),
        db.select({id:applications.id}).from(applications)
          .innerJoin(applicants,eq(applicants.applicationId,applications.id))
          .innerJoin(statuses,eq(applications.statusId,statuses.id))
          .where(and(eq(applications.agencyId,actor.agencyId),eq(applications.visaTypeId,input.visaTypeId),eq(statuses.isTerminal,false),eq(statuses.isDraft,false),
            sql`lower(regexp_replace(trim(coalesce(nullif(${applicants.fullName}, ''), concat_ws(' ', ${applicants.firstName}, ${applicants.lastName}))), '[[:space:]]+', ' ', 'g')) = lower(regexp_replace(trim(${input.fullName}), '[[:space:]]+', ' ', 'g'))`,
            sql`lower(trim(${applicants.nationality})) = lower(trim(${input.nationality}))`)).limit(1),
        input.expectedCatalogue?listRequirementsForVisaType(input.visaTypeId):Promise.resolve([])
      ]);
      const programme=programmes[0];
      const catalogueChanged=!!input.expectedCatalogue&&(!programme||bookingCatalogueFingerprint(programme,requirements)!==input.expectedCatalogue);
      return NextResponse.json({catalogueChanged,fee:programme?.fee??null,balance:wallet.balance,possibleDuplicate:matching.length>0, similarApplicationId:matching[0]?.id??null}, {headers:{"Cache-Control":"no-store"}});
    }
    const input = submission.parse(json);
    // A retry after a lost response works even after temporary files are removed.
    const id=await coalesceVisaSubmission(actor,input.attempt,async()=>{
    const [existing] = await db.select({ id: applications.id }).from(applications)
      .where(and(eq(applications.idempotencyKey, input.attempt), eq(applications.agencyId, actor.agencyId)));
    const committedId = existing?.id ?? (await submitVisaRequest({ actor, idempotencyKey: input.attempt, countryId: input.countryId,
      visaTypeId: input.visaTypeId, expectedFee: input.expectedFee, expectedCatalogue:input.expectedCatalogue, agencyNotes: input.notes, travellers: [{ fullName: input.fullName, nationality: input.nationality }],
      documents: await resolveRequestUploads(actor, input.attempt, input.visaTypeId, input.tokens) })).applicationId;
    await clearRequestUploads(actor, input.attempt).catch(() => {});
    return committedId;
    });
    revalidatePath("/portal", "layout"); revalidatePath("/admin", "layout");
    const response = NextResponse.json({ applicationId: id }, { headers: { "Cache-Control": "no-store" } });
    if (input.locale) response.cookies.set(UI_LOCALE_COOKIE, input.locale, { httpOnly:false, sameSite:"lax", secure:process.env.NODE_ENV==="production", maxAge:60*60*24*365, path:"/" });
    return response;
  } catch (error) {
    const locale = await getUiLocale();
    const code = error instanceof AppError ? error.code : error instanceof z.ZodError ? "VALIDATION" : "INTERNAL";
    return NextResponse.json({ code, error: requestErrorMessage(code,locale) }, { status: code === "UNAUTHENTICATED" ? 401 : code === "FORBIDDEN" ? 403 : code === "INTERNAL" ? 500 : 400 });
  }
}
