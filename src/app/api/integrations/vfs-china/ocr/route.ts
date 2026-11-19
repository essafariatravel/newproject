import { NextResponse } from "next/server";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  applications, countries, documents, documentTypes,
  passportMrzEvidence, statuses,
} from "@/db/schema";
import { storageProvider } from "@/lib/storage";
import { assertStoredFileIntegrity } from "@/lib/file-integrity";
import { recordVerifiedPassportFromOcr } from "@/lib/passport-ocr-evidence";
import { requireSignedVfsRequest, vfsOcrWorkerEnabled, vfsServiceActor } from "@/lib/vfs-integration-auth";
import { recordAudit } from "@/lib/audit";
import { currentOperationActor } from "@/lib/operation-identity";
import { AppError } from "@/lib/types";
import { readRequestBodyLimited } from "@/lib/http-body";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const uuid = z.string().uuid();
const passportStatuses = ["UPLOADED", "ACCEPTED", "UNDER_REVIEW"] as const;

function failed(err: unknown): NextResponse {
  if (err instanceof AppError) {
    const status = err.code === "UNAUTHENTICATED" ? 401 : err.code === "NOT_ENABLED" ? 404
      : err.code === "NOT_FOUND" ? 404 : err.code === "NOT_CONFIGURED" ? 503 : 400;
    return NextResponse.json({ code: err.code }, { status, headers: NO_STORE });
  }
  return NextResponse.json({ code: "UNAVAILABLE" }, { status: 503, headers: NO_STORE });
}

/**
 * Signed OCR worker queue/file endpoint. No agency user can read documents
 * through this path; the service principal and HMAC key are required.
 */
export async function GET(request: Request) {
  try {
    if (!vfsOcrWorkerEnabled()) throw new AppError("NOT_ENABLED", "OCR worker is disabled.");
    requireSignedVfsRequest(request, new Uint8Array());
    const actor = await vfsServiceActor();
    const u = new URL(request.url);
    const action = u.searchParams.get("action");

    const eligibility = and(
      eq(countries.iso2, "CN"),
      eq(statuses.isTerminal, false),
      eq(documentTypes.code, "COD-PASS"),
      inArray(documents.status, [...passportStatuses]),
      isNull(passportMrzEvidence.applicationId),
    );

    if (action === "queue") {
      const rows = await db.select({
        id: documents.id,
        applicationId: documents.applicationId,
        mime: documents.mimeType,
        bytes: documents.sizeBytes,
      }).from(documents)
        .innerJoin(applications, eq(documents.applicationId, applications.id))
        .innerJoin(countries, eq(applications.countryId, countries.id))
        .innerJoin(statuses, eq(applications.statusId, statuses.id))
        .innerJoin(documentTypes, eq(documents.documentTypeId, documentTypes.id))
        .leftJoin(passportMrzEvidence, eq(passportMrzEvidence.applicationId, applications.id))
        .where(eligibility).orderBy(desc(documents.createdAt)).limit(30);
      // No names, passport numbers, storage keys or original filenames.
      return NextResponse.json({
        documents: rows.filter(r => r.bytes > 0 && r.bytes <= 2 * 1024 * 1024 &&
          ["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(r.mime))
          .map(({ id, mime }) => ({ id, mime })),
      }, { headers: NO_STORE });
    }

    if (action !== "file") throw new AppError("VALIDATION", "Invalid OCR action.");
    const documentId = uuid.parse(u.searchParams.get("documentId"));
    const [row] = await db.select({
      doc: documents, agencyId: applications.agencyId,
    }).from(documents)
      .innerJoin(applications, eq(documents.applicationId, applications.id))
      .innerJoin(countries, eq(applications.countryId, countries.id))
      .innerJoin(statuses, eq(applications.statusId, statuses.id))
      .innerJoin(documentTypes, eq(documents.documentTypeId, documentTypes.id))
      .leftJoin(passportMrzEvidence, eq(passportMrzEvidence.applicationId, applications.id))
      .where(and(eq(documents.id, documentId), eligibility)).limit(1);
    if (!row || row.doc.sizeBytes > 2 * 1024 * 1024)
      throw new AppError("NOT_FOUND", "Passport not found.");

    const stored = await storageProvider().get(row.doc.storageKey);
    assertStoredFileIntegrity({
      data: stored.data,
      expectedSizeBytes: row.doc.sizeBytes,
      expectedSha256: row.doc.sha256,
    });
    if (stored.mimeType !== row.doc.mimeType) throw new AppError("INVALID_DOCUMENT", "Storage metadata mismatch.");

    await db.transaction(async (tx) => {
      const verified = await currentOperationActor(tx, actor);
      await recordAudit({
        actor: verified, action: "VFS_CHINA_PASSPORT_OCR_READ",
        entity: "document", entityId: documentId, agencyId: row.agencyId,
        metadata: { method: "signed-worker" },
      }, tx);
    });
    return new NextResponse(new Uint8Array(stored.data), {
      headers: { ...NO_STORE, "Content-Type": row.doc.mimeType, "Content-Length": String(stored.data.length) },
    });
  } catch (err) { return failed(err); }
}

const ocrResult = z.object({
  documentId: uuid,
  ocrText: z.string().min(10).max(80_000),
  extractorVersion: z.string().regex(/^[A-Za-z0-9._-]{2,60}$/),
}).strict();

export async function POST(request: Request) {
  try {
    if (!vfsOcrWorkerEnabled()) throw new AppError("NOT_ENABLED", "OCR worker is disabled.");
    const raw = await readRequestBodyLimited(request, 100_000);
    requireSignedVfsRequest(request, raw);
    const data = ocrResult.parse(JSON.parse(raw.toString("utf8")) as unknown);
    const actor = await vfsServiceActor();
    const outcome = await recordVerifiedPassportFromOcr({ ...data, actor });
    return NextResponse.json({ outcome }, { headers: NO_STORE });
  } catch (err) { return failed(err); }
}
