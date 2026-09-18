/**
 * Document service — secure upload, review workflow, tenant-safe retrieval.
 *
 * Ownership chain enforced server-side on EVERY access:
 *   user → agency → application → applicant/document
 */
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  applicants,
  applications,
  checklistItems,
  documentTypes,
  documents,
  statuses,
} from "@/db/schema";
import {
  ALLOWED_MIME_TYPES,
  AppError,
  DOCUMENT_REVIEW_ROLES,
  MAX_UPLOAD_BYTES,
  type AuthUser,
  type DocumentStatus,
} from "@/lib/types";
import { buildStorageKey, storageProvider } from "@/lib/storage";
import { recordAudit } from "@/lib/audit";
import { agencyUserIds, staffUserIds, notifyUsers } from "@/lib/notifications";
import { getStatusByCode } from "@/lib/applications";

/* ------------------------------------------------------------------ */
/* Tenant-safe loaders                                                 */
/* ------------------------------------------------------------------ */

interface ApplicationAccess {
  applicationId: string;
  agencyId: string;
  statusId: string;
  statusCode: string;
  isDraft: boolean;
}

/** Verify user → agency → application chain; returns application context. */
export async function assertApplicationAccess(
  applicationId: string,
  user: AuthUser,
): Promise<ApplicationAccess> {
  const rows = await db
    .select({
      id: applications.id,
      agencyId: applications.agencyId,
      statusId: applications.statusId,
      statusCode: statuses.code,
      isDraft: statuses.isDraft,
    })
    .from(applications)
    .innerJoin(statuses, eq(applications.statusId, statuses.id))
    .where(eq(applications.id, applicationId))
    .limit(1);
  const app = rows[0];
  if (!app) throw new AppError("NOT_FOUND", "Application not found.");
  if (user.agencyId && app.agencyId !== user.agencyId) {
    throw new AppError("NOT_FOUND", "Application not found."); // tenant isolation
  }
  return {
    applicationId: app.id,
    agencyId: app.agencyId,
    statusId: app.statusId,
    statusCode: app.statusCode,
    isDraft: app.isDraft,
  };
}

export async function listDocumentsForApplication(applicationId: string) {
  return db
    .select({
      doc: documents,
      documentTypeName: documentTypes.name,
      applicantName: sql<string | null>`(
        select a.first_name || ' ' || a.last_name from applicants a where a.id = documents.applicant_id
      )`,
    })
    .from(documents)
    .innerJoin(documentTypes, eq(documents.documentTypeId, documentTypes.id))
    .where(eq(documents.applicationId, applicationId))
    .orderBy(desc(documents.createdAt));
}

/** Load a single document enforcing the full ownership chain. */
export async function getDocumentForUser(documentId: string, user: AuthUser) {
  const rows = await db
    .select({
      doc: documents,
      appAgencyId: applications.agencyId,
      applicationReference: applications.reference,
    })
    .from(documents)
    .innerJoin(applications, eq(documents.applicationId, applications.id))
    .where(eq(documents.id, documentId))
    .limit(1);
  const row = rows[0];
  if (!row) throw new AppError("NOT_FOUND", "Document not found.");
  if (user.agencyId && row.appAgencyId !== user.agencyId) {
    throw new AppError("NOT_FOUND", "Document not found."); // tenant isolation
  }
  return row;
}

/* ------------------------------------------------------------------ */
/* Upload                                                             */
/* ------------------------------------------------------------------ */


export interface UploadDocumentInput {
  applicationId: string;
  actor: AuthUser;
  file: { name: string; type: string; size: number; data: Buffer };
  checklistItemId?: string | null;
  documentTypeId?: string | null;
  applicantId?: string | null;
  ipAddress?: string | null;
}

export async function uploadDocument(input: UploadDocumentInput) {
  const access = await assertApplicationAccess(input.applicationId, input.actor);

  // Only the owning tenant (or staff) may upload, and only before/at review stages.
  if (input.actor.agencyId && access.statusCode === "DRAFT") {
    // allowed
  } else if (input.actor.agencyId) {
    // agency can still upload when documents were requested / resubmission needed
    if (!["DOCUMENTS_REQUIRED", "UNDER_REVIEW", "SUBMITTED", "PROCESSING"].includes(access.statusCode)) {
      throw new AppError("UPLOAD_NOT_ALLOWED", "Documents cannot be uploaded in this status.");
    }
  }

  if (input.file.size <= 0) throw new AppError("EMPTY_FILE", "The uploaded file is empty.");
  if (input.file.size > MAX_UPLOAD_BYTES) {
    throw new AppError("FILE_TOO_LARGE", "Files must be 10 MB or smaller.");
  }
  if (!ALLOWED_MIME_TYPES.includes(input.file.type)) {
    throw new AppError("UNSUPPORTED_TYPE", "Allowed formats: PDF, JPEG, PNG, WEBP, DOC, DOCX.");
  }
  const name = input.file.name;
  if (name.length > 200 || /[\u0000-\u001f\\/]/.test(name)) {
    throw new AppError("INVALID_FILENAME", "Invalid file name.");
  }

  // Resolve the checklist item (must belong to this application).
  let checklistItem: { id: string; documentTypeId: string | null } | null = null;
  if (input.checklistItemId) {
    const rows = await db
      .select({
        id: checklistItems.id,
        documentTypeId: checklistItems.documentTypeId,
      })
      .from(checklistItems)
      .where(
        and(
          eq(checklistItems.id, input.checklistItemId),
          eq(checklistItems.applicationId, input.applicationId),
        ),
      )
      .limit(1);
    checklistItem = rows[0] ?? null;
    if (!checklistItem) {
      throw new AppError("NOT_FOUND", "Checklist item not found for this application.");
    }
  }

  const documentTypeId = checklistItem?.documentTypeId ?? input.documentTypeId ?? null;
  if (!documentTypeId) {
    throw new AppError("VALIDATION", "Select a document type for this upload.");
  }
  const dtRows = await db
    .select({ id: documentTypes.id, active: documentTypes.active })
    .from(documentTypes)
    .where(eq(documentTypes.id, documentTypeId))
    .limit(1);
  if (!dtRows[0]?.active) throw new AppError("NOT_FOUND", "Document type is not available.");

  // Applicant (optional) must belong to the same application.
  if (input.applicantId) {
    const rows = await db
      .select({ id: applicants.id })
      .from(applicants)
      .where(
        and(eq(applicants.id, input.applicantId), eq(applicants.applicationId, input.applicationId)),
      )
      .limit(1);
    if (!rows[0]) throw new AppError("NOT_FOUND", "Applicant not found for this application.");
  }

  // Version: uploading for an item that already has documents increments the version.
  let version = 1;
  if (checklistItem) {
    const v = await db
      .select({ max: sql<number | null>`max(${documents.version})` })
      .from(documents)
      .where(and(eq(documents.checklistItemId, checklistItem.id), eq(documents.applicationId, input.applicationId)));
    version = (v[0]?.max ?? 0) + 1;
  }

  const documentId = randomUUID();
  const storageKey = buildStorageKey(input.applicationId, documentId);
  await storageProvider().put(storageKey, input.file.data, input.file.type);

  const inserted = await db
    .insert(documents)
    .values({
      id: documentId,
      applicationId: input.applicationId,
      applicantId: input.applicantId ?? null,
      checklistItemId: checklistItem?.id ?? null,
      documentTypeId,
      originalFilename: name,
      mimeType: input.file.type,
      sizeBytes: input.file.size,
      storageKey,
      status: "UPLOADED",
      uploadedBy: input.actor.id,
      version,
    })
    .returning();
  const doc = inserted[0]!;

  await recordAudit({
    actor: input.actor,
    action: "DOCUMENT_UPLOADED",
    entity: "document",
    entityId: doc.id,
    agencyId: access.agencyId,
    metadata: { filename: name, sizeBytes: input.file.size, version },
    ipAddress: input.ipAddress ?? null,
  });

  const sIds = await staffUserIds();
  await notifyUsers(sIds, {
    type: "DOCUMENTS_REQUIRED",
    title: `Document uploaded${input.actor.agencyName ? ` by ${input.actor.agencyName}` : ""}`,
    body: `${name} was uploaded to the document pool.`,
    link: `/admin/documents`,
  });
  return doc;
}

/** Agency-side resubmission replaces a rejected/resubmission-required document. */
export async function uploadResubmission(input: UploadDocumentInput & { originalDocumentId: string }) {
  const original = await getDocumentForUser(input.originalDocumentId, input.actor);
  if (!["REJECTED", "RESUBMISSION_REQUIRED"].includes(original.doc.status)) {
    throw new AppError("INVALID_STATE", "This document was not rejected; upload to the checklist instead.");
  }
  const doc = await uploadDocument({
    ...input,
    checklistItemId: original.doc.checklistItemId,
    documentTypeId: null,
  });
  await recordAudit({
    actor: input.actor,
    action: "DOCUMENT_RESUBMITTED",
    entity: "document",
    entityId: doc.id,
    agencyId: original.appAgencyId,
    metadata: { replaces: original.doc.id, filename: doc.originalFilename },
    ipAddress: input.ipAddress ?? null,
  });
  return doc;
}

/* ------------------------------------------------------------------ */
/* Review                                                              */
/* ------------------------------------------------------------------ */

export interface ReviewInput {
  documentId: string;
  actor: AuthUser;
  status: Extract<DocumentStatus, "UNDER_REVIEW" | "ACCEPTED" | "REJECTED" | "RESUBMISSION_REQUIRED">;
  reviewNotes?: string | null;
  rejectionReason?: string | null;
  ipAddress?: string | null;
}

export async function reviewDocument(input: ReviewInput) {
  if (!DOCUMENT_REVIEW_ROLES.includes(input.actor.role)) {
    throw new AppError("FORBIDDEN", "Only ESSAFARIA staff can review documents.");
  }
  const rows = await db
    .select({
      doc: documents,
      appAgencyId: applications.agencyId,
      appReference: applications.reference,
    })
    .from(documents)
    .innerJoin(applications, eq(documents.applicationId, applications.id))
    .where(eq(documents.id, input.documentId))
    .limit(1);
  const row = rows[0];
  if (!row) throw new AppError("NOT_FOUND", "Document not found.");

  const requiresReason = input.status === "REJECTED" || input.status === "RESUBMISSION_REQUIRED";
  const reason = input.rejectionReason?.trim() ?? "";
  if (requiresReason && reason.length < 5) {
    throw new AppError(
      "REASON_REQUIRED",
      "A rejection / resubmission reason (min 5 characters) is mandatory.",
    );
  }
  if (!requiresReason && reason && input.status === "ACCEPTED") {
    // acceptance may carry notes; nothing to enforce
  }

  await db
    .update(documents)
    .set({
      status: input.status,
      reviewNotes: input.reviewNotes?.trim() || null,
      rejectionReason: requiresReason ? reason : input.status === "ACCEPTED" ? null : row.doc.rejectionReason,
      reviewedBy: input.actor.id,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(documents.id, input.documentId));

  await recordAudit({
    actor: input.actor,
    action: `DOCUMENT_${input.status}`,
    entity: "document",
    entityId: input.documentId,
    agencyId: row.appAgencyId,
    metadata: {
      filename: row.doc.originalFilename,
      reason: requiresReason ? reason : null,
      notes: input.reviewNotes ?? null,
    },
    ipAddress: input.ipAddress ?? null,
  });

  const aIds = await agencyUserIds(row.appAgencyId);
  const titles: Record<string, string> = {
    UNDER_REVIEW: `Document under review — ${row.appReference}`,
    ACCEPTED: `Document accepted — ${row.appReference}`,
    REJECTED: `Document rejected — ${row.appReference}`,
    RESUBMISSION_REQUIRED: `Resubmission required — ${row.appReference}`,
  };
  await notifyUsers(aIds, {
    type:
      input.status === "REJECTED"
        ? "DOCUMENT_REJECTED"
        : input.status === "RESUBMISSION_REQUIRED"
          ? "RESUBMISSION_REQUIRED"
          : input.status === "ACCEPTED"
            ? "DOCUMENT_ACCEPTED"
            : "STATUS_CHANGED",
    title: titles[input.status] ?? "Document update",
    body: `${row.doc.originalFilename}: ${input.status === "REJECTED" || input.status === "RESUBMISSION_REQUIRED" ? reason : input.status.replaceAll("_", " ").toLowerCase()}.`,
    link: `/portal/applications/${row.doc.applicationId}`,
    agencyId: row.appAgencyId,
    applicationId: row.doc.applicationId,
  });
}

/* ------------------------------------------------------------------ */
/* Delete (agency, draft only)                                         */
/* ------------------------------------------------------------------ */

export async function deleteDocument(documentId: string, actor: AuthUser, ipAddress?: string | null) {
  const row = await getDocumentForUser(documentId, actor);
  if (!actor.agencyId || row.appAgencyId !== actor.agencyId) {
    throw new AppError("FORBIDDEN", "Only the owning agency can remove a document.");
  }
  const draft = await getStatusByCode("DRAFT");
  const appRows = await db
    .select({ statusId: applications.statusId })
    .from(applications)
    .where(eq(applications.id, row.doc.applicationId))
    .limit(1);
  if (appRows[0]?.statusId !== draft.id) {
    throw new AppError("DELETE_NOT_ALLOWED", "Documents can only be removed while the application is a draft.");
  }
  await db.delete(documents).where(eq(documents.id, documentId));
  await storageProvider().delete(row.doc.storageKey).catch(() => {});
  await recordAudit({
    actor,
    action: "DOCUMENT_DELETED",
    entity: "document",
    entityId: documentId,
    agencyId: row.appAgencyId,
    metadata: { filename: row.doc.originalFilename },
    ipAddress: ipAddress ?? null,
  });
}

/* ------------------------------------------------------------------ */
/* Listing helpers                                                     */
/* ------------------------------------------------------------------ */

export async function listApplicantsForApplication(applicationId: string) {
  return db
    .select()
    .from(applicants)
    .where(eq(applicants.applicationId, applicationId))
    .orderBy(asc(applicants.createdAt));
}

export async function getDocumentStatusCounts() {
  return db
    .select({ status: documents.status, count: sql<number>`count(*)::int` })
    .from(documents)
    .groupBy(documents.status);
}
