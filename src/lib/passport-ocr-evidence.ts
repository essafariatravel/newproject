import "server-only";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  applicants, applications, countries, documents, documentTypes,
  passportMrzEvidence, statuses,
} from "@/db/schema";
import { AppError, isStaffRole, type AuthUser } from "@/lib/types";
import { currentOperationActor } from "@/lib/operation-identity";
import { assertAgencyOperational } from "@/lib/agency-identity";
import { recordAudit } from "@/lib/audit";
import { extractVerifiedPassportMrz } from "@/lib/passport-mrz";
import { vfsChinaStaffBindingEnabled } from "@/lib/vfs-china-bindings";

export type PassportOcrRecordOutcome = "RECORDED" | "UNCHANGED" | "REVIEW_REQUIRED";

/**
 * Persist an OCR-derived passport number only after ALL TD3 MRZ check digits
 * passed. The OCR engine is a trusted internal dependency; raw OCR text is
 * never logged or retained. No client-facing action accepts arbitrary OCR text.
 *
 * This is an ingestion sink, not an OCR engine. The actual image/PDF OCR worker
 * must be qualified independently before automatic processing is enabled.
 */
export async function recordVerifiedPassportFromOcr(input: {
  documentId: string;
  ocrText: string;
  actor: AuthUser;
  extractorVersion: string;
}): Promise<PassportOcrRecordOutcome> {
  if (!vfsChinaStaffBindingEnabled()) throw new AppError("NOT_ENABLED", "VFS China OCR storage is disabled.");
  if (!/^[A-Za-z0-9._-]{2,60}$/.test(input.extractorVersion))
    throw new AppError("VALIDATION", "Invalid internal extractor version.");
  if (input.actor.mustChangePassword) throw new AppError("FORBIDDEN", "Please complete sign-in first.");
  const parsed = extractVerifiedPassportMrz(input.ocrText);
  if (!parsed) return "REVIEW_REQUIRED";

  return db.transaction(async (tx) => {
    await currentOperationActor(tx, input.actor);
    const [doc] = await tx.select({
      id: documents.id,
      applicationId: documents.applicationId,
      docStatus: documents.status,
      docType: documentTypes.code,
      agencyId: applications.agencyId,
      countryIso2: countries.iso2,
      terminal: statuses.isTerminal,
    }).from(documents)
      .innerJoin(documentTypes, eq(documentTypes.id, documents.documentTypeId))
      .innerJoin(applications, eq(applications.id, documents.applicationId))
      .innerJoin(countries, eq(countries.id, applications.countryId))
      .innerJoin(statuses, eq(statuses.id, applications.statusId))
      .where(eq(documents.id, input.documentId))
      .limit(1).for("update", { of: applications });

    if (!doc) throw new AppError("NOT_FOUND", "Passport document not found.");
    if (doc.countryIso2 !== "CN" || doc.terminal || !["PASSPORT", "COD-PASS"].includes(doc.docType) ||
        !["UPLOADED", "ACCEPTED", "UNDER_REVIEW"].includes(doc.docStatus)) {
      throw new AppError("INVALID_DOCUMENT", "Only an open China dossier's passport document can be read.");
    }
    if (input.actor.agencyId) {
      if (input.actor.agencyId !== doc.agencyId)
        throw new AppError("FORBIDDEN", "The passport is not owned by this agency.");
    } else if (!isStaffRole(input.actor.role)) {
      throw new AppError("FORBIDDEN", "Invalid OCR operation actor.");
    }
    await assertAgencyOperational(tx, doc.agencyId, doc.applicationId);

    // A replacement passport may have been submitted while OCR was running.
    // Never persist an older document as the current verified identity.
    const [latestPassport] = await tx.select({ id: documents.id }).from(documents)
      .innerJoin(documentTypes, eq(documents.documentTypeId, documentTypes.id))
      .where(and(
        eq(documents.applicationId, doc.applicationId),
        inArray(documentTypes.code, ["PASSPORT", "COD-PASS"]),
        ne(documents.status, "REJECTED"),
      )).orderBy(desc(documents.createdAt), desc(documents.id)).limit(1);
    if (!latestPassport || latestPassport.id !== doc.id) return "REVIEW_REQUIRED";

    const traveler = await tx.select({ id: applicants.id, passportNumber: applicants.passportNumber })
      .from(applicants).where(eq(applicants.applicationId, doc.applicationId)).limit(2);
    if (traveler.length !== 1) return "REVIEW_REQUIRED";
    if (traveler[0]!.passportNumber &&
        traveler[0]!.passportNumber.trim().toUpperCase() !== parsed.passportNumber) return "REVIEW_REQUIRED";

    const [existing] = await tx.select({
      documentId: passportMrzEvidence.documentId,
    }).from(passportMrzEvidence)
      .where(eq(passportMrzEvidence.applicationId, doc.applicationId)).limit(1);

    if (existing) {
      if (existing.documentId === doc.id &&
          traveler[0]!.passportNumber?.trim().toUpperCase() === parsed.passportNumber) return "UNCHANGED";
      return "REVIEW_REQUIRED";
    }

    // The extracted passport number and its evidence become visible together.
    if (!traveler[0]!.passportNumber) {
      await tx.update(applicants).set({ passportNumber: parsed.passportNumber })
        .where(eq(applicants.id, traveler[0]!.id));
    }
    await tx.insert(passportMrzEvidence).values({
      applicationId: doc.applicationId,
      documentId: doc.id,
      verifiedBy: input.actor.id,
      extractorVersion: input.extractorVersion,
    });
    await recordAudit({
      actor: input.actor,
      action: "PASSPORT_MRZ_VERIFIED",
      entity: "application",
      entityId: doc.applicationId,
      agencyId: doc.agencyId,
      metadata: { sourceDocumentId: doc.id, extractorVersion: input.extractorVersion },
    }, tx);
    return "RECORDED";
  });
}

export async function isPassportMrzVerified(applicationId: string): Promise<boolean> {
  if (!vfsChinaStaffBindingEnabled()) return false;
  const [row] = await db.select({ applicationId: passportMrzEvidence.applicationId })
    .from(passportMrzEvidence).where(eq(passportMrzEvidence.applicationId, applicationId)).limit(1);
  return Boolean(row);
}
