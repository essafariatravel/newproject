import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  applicants, applications, countries, passportMrzEvidence, statuses,
  vfsChinaBindings, vfsChinaMailEvents,
} from "@/db/schema";
import { recordApplicationDecision } from "@/lib/applications";
import { AppError, MAX_UPLOAD_BYTES } from "@/lib/types";
import { sha256Hex } from "@/lib/file-integrity";
import { validateDocumentFormat } from "@/lib/upload-validation";
import { readRequestBodyLimited } from "@/lib/http-body";
import {
  matchVfsChinaCertificate, parseVfsCertificateText,
  type ChinaApplicationCandidate,
} from "@/lib/vfs-china-certificate";
import {
  requireSignedVfsRequest, vfsIntegrationEnabled, vfsMailDecisionEnabled,
  vfsServiceActor, MAX_VFS_INTAKE_BYTES,
} from "@/lib/vfs-integration-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const MAX_PDF_B64 = Math.ceil(MAX_UPLOAD_BYTES * 4 / 3) + 10;

const mailShape = z.object({
  gmailMessageId: z.string().regex(/^[A-Za-z0-9_-]{8,120}$/),
  from: z.string().max(300),
  recipients: z.array(z.string().max(300)).min(1).max(12),
  subject: z.string().max(250),
  body: z.string().max(25_000),
  pdfFilename: z.string().max(130),
  pdfBase64: z.string().min(100).max(MAX_PDF_B64).regex(/^[A-Za-z0-9+/]+={0,2}$/),
  certificateText: z.string().min(35).max(80_000),
  gmailDmarcVerified: z.literal(true),
}).strict();

function failure(err: unknown): NextResponse {
  if (err instanceof AppError) {
    return NextResponse.json({ code: err.code }, {
      status: err.code === "NOT_ENABLED" ? 404 :
        err.code === "UNAUTHENTICATED" ? 401 :
        err.code === "NOT_CONFIGURED" ? 503 : 400,
      headers: HEADERS,
    });
  }
  return NextResponse.json({ code: "UNAVAILABLE" }, { status: 503, headers: HEADERS });
}

async function existingEvent(messageId: string) {
  const [row] = await db.select().from(vfsChinaMailEvents)
    .where(eq(vfsChinaMailEvents.gmailMessageId, messageId)).limit(1);
  return row ?? null;
}

async function candidateForVfsReference(reference: string): Promise<ChinaApplicationCandidate[]> {
  const rows = await db.select({
    applicationId: applications.id,
    agencyId: applications.agencyId,
    destinationIso2: countries.iso2,
    statusCode: statuses.code,
    vfsReference: vfsChinaBindings.vfsReference,
    passportNumber: applicants.passportNumber,
    passportOcrEvidence: passportMrzEvidence.applicationId,
  }).from(vfsChinaBindings)
    .innerJoin(applications, eq(vfsChinaBindings.applicationId, applications.id))
    .innerJoin(countries, eq(applications.countryId, countries.id))
    .innerJoin(statuses, eq(applications.statusId, statuses.id))
    .innerJoin(applicants, eq(applicants.applicationId, applications.id))
    .leftJoin(passportMrzEvidence, eq(passportMrzEvidence.applicationId, applications.id))
    .where(eq(vfsChinaBindings.vfsReference, reference)).limit(3);
  return rows.map(row => ({
    applicationId: row.applicationId, agencyId: row.agencyId,
    destinationIso2: row.destinationIso2, statusCode: row.statusCode,
    vfsReference: row.vfsReference, passportNumber: row.passportNumber,
    passportOcrVerified: Boolean(row.passportOcrEvidence),
  }));
}

type Claim = "CLAIMED" | "BUSY" | "DONE" | "MISMATCH";

/**
 * Mail message ID is unique. The application row and official decision
 * workflow supply a second concurrency guard. Leases allow retries after
 * storage/network crashes while protecting simultaneous worker calls.
 */
async function claimMail(input: {
  messageId: string; reference: string; pdfHash: string; applicationId: string;
}): Promise<Claim> {
  return db.transaction(async (tx) => {
    const [old] = await tx.select().from(vfsChinaMailEvents)
      .where(eq(vfsChinaMailEvents.gmailMessageId, input.messageId)).limit(1).for("update");
    const now = new Date(), leasedUntil = new Date(now.getTime() + 10 * 60_000);
    if (old) {
      if (old.certificateReference !== input.reference ||
          old.pdfSha256 !== input.pdfHash || old.applicationId !== input.applicationId)
        return "MISMATCH";
      if (old.status === "COMPLETED") return "DONE";
      if (old.leasedUntil > now) return "BUSY";
      await tx.update(vfsChinaMailEvents).set({
        status: "PROCESSING", attempts: old.attempts + 1,
        leasedUntil, lastErrorCode: null, updatedAt: now,
      }).where(eq(vfsChinaMailEvents.gmailMessageId, input.messageId));
      return "CLAIMED";
    }
    // A second event may point to the same application. The canonical
    // decision workflow still locks that dossier, preventing double approval.
    const [newEvent] = await tx.insert(vfsChinaMailEvents).values({
      gmailMessageId: input.messageId,
      certificateReference: input.reference,
      pdfSha256: input.pdfHash,
      applicationId: input.applicationId,
      leasedUntil,
    }).onConflictDoNothing().returning({ id: vfsChinaMailEvents.gmailMessageId });
    return newEvent ? "CLAIMED" : "BUSY";
  });
}

function outcome(outcome: string): NextResponse {
  return NextResponse.json({ outcome }, { headers: HEADERS });
}

/**
 * Signed event from an OWNER-installed Gmail Apps Script that independently
 * verifies Gmail Authentication-Results and extracts the PDF text using Docs.
 * This is not a public "approve dossier" API: 3 feature gates, HMAC, unique
 * Staff reference, MRZ evidence, canonical decision transition + audit.
 */
export async function POST(request: Request) {
  try {
    if (!vfsIntegrationEnabled()) throw new AppError("NOT_ENABLED", "VFS integration is disabled.");
    const raw = await readRequestBodyLimited(request, MAX_VFS_INTAKE_BYTES);
    requireSignedVfsRequest(request, raw);
    const input = mailShape.parse(JSON.parse(raw.toString("utf8")) as unknown);
    const file = Buffer.from(input.pdfBase64, "base64");
    if (file.length < 100 || file.length > MAX_UPLOAD_BYTES ||
        file.toString("ascii", 0, 5) !== "%PDF-")
      return outcome("REVIEW_REQUIRED");
    const filename = input.pdfFilename;
    try {
      validateDocumentFormat({ name: filename, type: "application/pdf", data: file });
    } catch { return outcome("REVIEW_REQUIRED"); }

    const certificate = parseVfsCertificateText(input.certificateText);
    if (!certificate) return outcome("REVIEW_REQUIRED");
    const pdfHash = sha256Hex(file);

    const prior = await existingEvent(input.gmailMessageId);
    if (prior) {
      if (prior.pdfSha256 !== pdfHash || prior.certificateReference !== certificate.reference)
        return outcome("REVIEW_REQUIRED");
      if (prior.status === "COMPLETED") return outcome("ALREADY_PROCESSED");
    }

    const candidates = await candidateForVfsReference(certificate.reference);
    const match = matchVfsChinaCertificate({
      from: input.from, recipients: input.recipients, subject: input.subject,
      body: input.body, pdfFilename: filename,
      // TRUST BOUNDARY: this fact comes only from our owner-controlled,
      // HMAC-authenticated Apps Script. Never accept unsigned email claims.
      gmailDmarcVerified: input.gmailDmarcVerified,
    }, certificate, candidates);

    if (match.state === "IGNORED_OFFLINE") return outcome("IGNORED_OFFLINE");
    if (match.state !== "MATCHED") return outcome("REVIEW_REQUIRED");

    // Preview lets us test recognition without touching dossiers.
    if (!vfsMailDecisionEnabled()) return outcome("MATCHED_DRY_RUN");

    const actor = await vfsServiceActor();
    const claimed = await claimMail({
      messageId: input.gmailMessageId,
      reference: certificate.reference,
      pdfHash,
      applicationId: match.applicationId,
    });
    if (claimed === "DONE") return outcome("ALREADY_PROCESSED");
    if (claimed === "BUSY") return outcome("PROCESSING");
    if (claimed === "MISMATCH") return outcome("REVIEW_REQUIRED");

    try {
      const decided = await recordApplicationDecision({
        actor, applicationId: match.applicationId, outcome: "APPROVED",
        file: { name: filename, type: "application/pdf", size: file.length, data: file },
      });
      await db.update(vfsChinaMailEvents).set({
        status: "COMPLETED", decisionDocumentId: decided.documentId,
        completedAt: new Date(), lastErrorCode: null, updatedAt: new Date(),
      }).where(and(
        eq(vfsChinaMailEvents.gmailMessageId, input.gmailMessageId),
        eq(vfsChinaMailEvents.applicationId, match.applicationId),
      ));
      return outcome("APPROVED");
    } catch (err) {
      // No retry until next lease, so a partial storage failure can be
      // reconciled. Never leak source content or passport details to callers.
      const errorCode = err instanceof AppError ? err.code : "UNAVAILABLE";
      await db.update(vfsChinaMailEvents).set({
        status: "REVIEW_REQUIRED", lastErrorCode: errorCode,
        leasedUntil: new Date(Date.now() + 10 * 60_000), updatedAt: new Date(),
      }).where(eq(vfsChinaMailEvents.gmailMessageId, input.gmailMessageId)).catch(() => {});
      return outcome("REVIEW_REQUIRED");
    }
  } catch (err) { return failure(err); }
}
