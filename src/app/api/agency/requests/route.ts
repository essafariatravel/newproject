import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireAgencyUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { applications } from "@/db/schema";
import { AppError } from "@/lib/types";
import { submitVisaRequest } from "@/lib/requests";
import { stageRequestUpload, resolveRequestUploads, clearRequestUploads } from "@/lib/request-uploads";
import { contentT } from "@/lib/i18n-content";
import { getUiLocale } from "@/lib/ui-i18n";

export const runtime = "nodejs";
const submission = z.object({ attempt: z.string().uuid(), visaTypeId: z.string().uuid(), countryId: z.string().uuid(),
  fullName: z.string().max(200), nationality: z.string().max(80), notes: z.string().max(1000), tokens: z.array(z.string()).max(60) });

export async function POST(request: Request) {
  try {
    // Session cookies alone do not authorize a cross-site mutation.
    if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const actor = await requireAgencyUser();
    if (Number(request.headers.get("content-length") ?? 0) > 3 * 1024 * 1024) throw new AppError("FILE_TOO_LARGE", "Files must be 2 MB or smaller.");
    if (request.headers.get("content-type")?.startsWith("multipart/form-data")) {
      const form = await request.formData(), file = form.get("file");
      if (!(file instanceof File)) throw new AppError("EMPTY_FILE", "Choose a file.");
      const token = await stageRequestUpload({ actor, attempt: String(form.get("attempt")), visaTypeId: String(form.get("visaTypeId")),
        documentTypeId: String(form.get("documentTypeId")), slot: Number(form.get("slot")),
        file: { name: file.name, type: file.type, size: file.size, data: Buffer.from(await file.arrayBuffer()) } });
      return NextResponse.json({ token }, { headers: { "Cache-Control": "no-store" } });
    }
    const input = submission.parse(await request.json());
    // A retry after a lost response works even after temporary files are removed.
    const [existing] = await db.select({ id: applications.id }).from(applications)
      .where(and(eq(applications.idempotencyKey, input.attempt), eq(applications.agencyId, actor.agencyId)));
    const id = existing?.id ?? (await submitVisaRequest({ actor, idempotencyKey: input.attempt, countryId: input.countryId,
      visaTypeId: input.visaTypeId, agencyNotes: input.notes, travellers: [{ fullName: input.fullName, nationality: input.nationality }],
      documents: await resolveRequestUploads(actor, input.attempt, input.visaTypeId, input.tokens) })).applicationId;
    await clearRequestUploads(actor, input.attempt).catch(() => {});
    revalidatePath("/portal", "layout"); revalidatePath("/admin", "layout");
    return NextResponse.json({ applicationId: id }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const ct = contentT(await getUiLocale());
    const code = error instanceof AppError ? error.code : error instanceof z.ZodError ? "VALIDATION" : "INTERNAL";
    const key = `request.error.${code}`;
    return NextResponse.json({ code, error: ct(key) === key ? ct("request.error.INTERNAL") : ct(key) }, { status: code === "UNAUTHENTICATED" ? 401 : code === "FORBIDDEN" ? 403 : code === "INTERNAL" ? 500 : 400 });
  }
}
