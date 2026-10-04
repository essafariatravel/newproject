import { validateDocumentFormat } from "@/lib/upload-validation";
import { qualifiedTable } from "./database-schema";
import { fileNameProblem, fileNameErrorMessage } from "@/lib/filename";
/**
 * Document service — secure upload, review workflow, tenant-safe retrieval.
 * Post-submission locking: agency uploads are blocked unless staff explicitly
 * requested replacement/additional via document_requests.
 */
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  applicants,
  applications,
  checklistItems,
  documentRequests,
  documentTypes,
  documents,
  statuses,
  users,
  notifications,
  auditLogs,
} from "@/db/schema";
import {
  ALLOWED_MIME_TYPES,
  AppError,
  isStaffRole,
  MAX_UPLOAD_BYTES,
  type AuthUser,
  type DocumentStatus,
} from "@/lib/types";
import { buildStorageKey, storageProvider } from "@/lib/storage";
import { recordAudit } from "@/lib/audit";
import { currentOperationActor } from "@/lib/operation-identity";
import { agencyUserIds, staffUserIds, notifyUsers } from "@/lib/notifications";
import { getStatusByCode } from "@/lib/applications";

interface ApplicationAccess {
  applicationId: string;
  agencyId: string;
  statusId: string;
  statusCode: string;
  isDraft: boolean;
  isTerminal: boolean;
  reference: string;
}

export async function assertApplicationAccess(
  applicationId: string,
  user: AuthUser,
): Promise<ApplicationAccess> {
  if (user.mustChangePassword || (!user.agencyId && !isStaffRole(user.role))) throw new AppError("FORBIDDEN", "You are not authorized to access this application.");
  const rows = await db
    .select({
      id: applications.id,
      reference: applications.reference,
      agencyId: applications.agencyId,
      statusId: applications.statusId,
      statusCode: statuses.code,
      isDraft: statuses.isDraft,
      isTerminal: statuses.isTerminal,
    })
    .from(applications)
    .innerJoin(statuses, eq(applications.statusId, statuses.id))
    .where(eq(applications.id, applicationId))
    .limit(1);
  const app = rows[0];
  if (!app) throw new AppError("NOT_FOUND", "Application not found.");
  if (user.agencyId && app.agencyId !== user.agencyId) {
    throw new AppError("NOT_FOUND", "Application not found.");
  }
  return {
    applicationId: app.id,
    reference: app.reference,
    agencyId: app.agencyId,
    statusId: app.statusId,
    statusCode: app.statusCode,
    isDraft: app.isDraft,
    isTerminal: app.isTerminal,
  };
}

export async function listDocumentsForApplication(applicationId: string) {
  return db
    .select({
      doc: documents,
      documentTypeName: documentTypes.name,
      documentTypeCode: documentTypes.code,
      applicantName: sql<string | null>`(
        select a.first_name || ' ' || a.last_name from ${sql.raw(qualifiedTable("applicants"))} a where a.id = documents.applicant_id
      )`,
    })
    .from(documents)
    .innerJoin(documentTypes, eq(documents.documentTypeId, documentTypes.id))
    .where(eq(documents.applicationId, applicationId))
    .orderBy(desc(documents.createdAt));
}

export async function getDocumentForUser(documentId: string, user: AuthUser) {
  if (user.mustChangePassword) throw new AppError("PASSWORD_CHANGE_REQUIRED", "You must set a new password before continuing.");
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
    throw new AppError("NOT_FOUND", "Document not found.");
  }
  return row;
}

export interface UploadDocumentInput {
  applicationId: string;
  actor: AuthUser;
  file: { name: string; type: string; size: number; data: Buffer };
  checklistItemId?: string | null;
  documentTypeId?: string | null;
  applicantId?: string | null;
  ipAddress?: string | null;
}

export async function uploadDocument(input: UploadDocumentInput, resubmittedDocumentId?: string) {
  const access = await assertApplicationAccess(input.applicationId, input.actor);

  // Resolve checklist item first to know document type
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

  // Post-submission locking: agency uploads only allowed if DRAFT or OPEN request exists
  // Locked after submission — only staff-requested replacement/additional via document_requests unlocks uploads
  if (input.actor.agencyId && !access.isDraft) {
    // Terminal statuses never allow agency uploads
    if (["APPROVED", "REJECTED", "CANCELLED", "COMPLETED", "REFUSED"].includes(access.statusCode)) {
      throw new AppError("UPLOAD_NOT_ALLOWED", "Documents are locked — application is already completed. Locked after submission.");
    }
    // Check for open document_requests that authorize this upload
    const openRequests = await db
      .select()
      .from(documentRequests)
      .where(
        and(
          eq(documentRequests.applicationId, input.applicationId),
          eq(documentRequests.status, "OPEN"),
        ),
      );
    const authorized = openRequests.some((r) => {
      if (r.checklistItemId && input.checklistItemId) return r.checklistItemId === input.checklistItemId;
      if (r.documentTypeId === documentTypeId) return true;
      if (r.checklistItemId && checklistItem && r.checklistItemId === checklistItem.id) return true;
      return false;
    });
    if (!authorized) {
      throw new AppError(
        "UPLOAD_NOT_ALLOWED",
        "Documents are locked after submission. ESSAFARIA will request replacement or additional documents if needed.",
      );
    }
  }

  if (input.file.size <= 0 || input.file.data.length === 0) throw new AppError("EMPTY_FILE", "The uploaded file is empty.");
  if (input.file.size > MAX_UPLOAD_BYTES || input.file.data.length > MAX_UPLOAD_BYTES) {
    throw new AppError("FILE_TOO_LARGE", "Files must be 2 MB or smaller.");
  }
  if (!ALLOWED_MIME_TYPES.includes(input.file.type)) {
    throw new AppError("UNSUPPORTED_TYPE", "Allowed formats: PDF, JPEG, PNG, WEBP, DOC, DOCX.");
  }
  const name = input.file.name;
  const problem = fileNameProblem(name);
  if (problem) throw new AppError("INVALID_FILENAME", fileNameErrorMessage(problem));

  validateDocumentFormat(input.file);
  const dtRows = await db
    .select({ id: documentTypes.id, code: documentTypes.code, name: documentTypes.name, active: documentTypes.active, agencyUploadable: documentTypes.agencyUploadable })
    .from(documentTypes)
    .where(eq(documentTypes.id, documentTypeId))
    .limit(1);
  if (!dtRows[0]?.active) throw new AppError("NOT_FOUND", "Document type is not available.");
  // Decision documents (issued visa / approval) belong to ESSAFARIA's staff
  // workflow: an agency can never upload into that slot, even with an open
  // request, and such a request can no longer be created (see document-requests).
  if (input.actor.agencyId && dtRows[0].agencyUploadable === false) {
    throw new AppError(
      "UPLOAD_NOT_ALLOWED",
      `"${dtRows[0].name}" is issued by ESSAFARIA and is not uploaded by agencies.`,
    );
  }
  if (dtRows[0].code.startsWith("DECISION_")) throw new AppError("DECISION_REQUIRED", "Official decision documents must be recorded through the final-decision panel.");

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

  const documentId = randomUUID();
  const storageKey = buildStorageKey(input.applicationId, documentId);
  await storageProvider().put(storageKey, input.file.data, input.file.type);
  let doc: typeof documents.$inferSelect;
  let fulfilledRequest = false;
  try {
    doc = await db.transaction(async (tx) => {
      input = { ...input, actor: await currentOperationActor(tx,input.actor) };
      // Lock the dossier across request validation, version allocation and insert.
      // A concurrent replacement waits, then sees the request already fulfilled.
      await tx.select({ id: applications.id }).from(applications)
        .where(eq(applications.id, input.applicationId)).for("update");
      const current = (await tx.select({ code: statuses.code, draft: statuses.isDraft })
        .from(applications).innerJoin(statuses, eq(applications.statusId, statuses.id))
        .where(eq(applications.id, input.applicationId)))[0]!;
      let request: typeof documentRequests.$inferSelect | undefined;
      if (input.actor.agencyId) {
        if (["APPROVED", "REJECTED", "CANCELLED", "COMPLETED", "REFUSED"].includes(current.code)) {
          throw new AppError("UPLOAD_NOT_ALLOWED", "Documents are locked after the final decision.");
        }
        const open = await tx.select().from(documentRequests).where(and(
          eq(documentRequests.applicationId, input.applicationId), eq(documentRequests.status, "OPEN"),
          eq(documentRequests.documentTypeId, documentTypeId),
        )).for("update");
        request = open.find((r) => !r.checklistItemId || r.checklistItemId === checklistItem?.id);
        if (!current.draft && !request) throw new AppError("UPLOAD_NOT_ALLOWED", "This document request has already been fulfilled or closed.");
      }
      const versions = await tx.select({ max: sql<number | null>`max(${documents.version})` }).from(documents)
        .where(and(eq(documents.applicationId, input.applicationId), checklistItem
          ? eq(documents.checklistItemId, checklistItem.id) : eq(documents.documentTypeId, documentTypeId)));
      const version = (versions[0]?.max ?? 0) + 1;
      const [created] = await tx.insert(documents).values({
        id: documentId, applicationId: input.applicationId, applicantId: input.applicantId ?? null,
        checklistItemId: checklistItem?.id ?? null, documentTypeId,
        originalFilename: name, mimeType: input.file.type, sizeBytes: input.file.data.length,
        storageKey, status: "UPLOADED", uploadedBy: input.actor.id, version,
      }).returning();
      if (request) {
        await tx.update(documentRequests).set({ status: "FULFILLED", fulfilledBy: input.actor.id,
          fulfilledDocumentId: created!.id, fulfilledAt: new Date(), updatedAt: new Date(),
        }).where(and(eq(documentRequests.id, request.id), eq(documentRequests.status, "OPEN")));
        fulfilledRequest = true;
        const recipients = await tx.select({ id: users.id }).from(users).where(sql`${users.agencyId} is null and ${users.status} = 'ACTIVE'`);
        if (recipients.length) await tx.insert(notifications).values(recipients.map(({ id }) => ({
          userId: id, type: "DOCUMENT_REQUEST_FULFILLED", title: `Requested document received — ${access.reference}`,
          body: name, agencyId: access.agencyId, applicationId: input.applicationId,
          documentRequestId: request!.id,
          link: `/admin/applications/${input.applicationId}?tab=documents`,
        })));
      }
      await tx.insert(auditLogs).values({ actorId: input.actor.id, actorEmail: input.actor.email,
        actorRole: input.actor.role, agencyId: access.agencyId, action: "DOCUMENT_UPLOADED", entity: "document",
        entityId: created!.id, metadata: { actorName: input.actor.name, actorUsername: input.actor.username, filename: name, sizeBytes: input.file.data.length, version, checklistItemId: checklistItem?.id ?? null },
        ipAddress: input.ipAddress ?? null,
      });
      if (resubmittedDocumentId) await recordAudit({ actor: input.actor, action: "DOCUMENT_RESUBMITTED", entity: "document",
        entityId: created!.id, agencyId: access.agencyId, metadata: { replaces: resubmittedDocumentId, filename: name, applicationId: input.applicationId },
        ipAddress: input.ipAddress ?? null }, tx);
      return created!;
    });
  } catch (error) {
    await storageProvider().delete(storageKey).catch(() => {});
    throw error;
  }

  // Notify staff if agency uploaded outside fulfillment path (draft stage)
  if (input.actor.agencyId && access.isDraft && !fulfilledRequest) {
    const sIds = await staffUserIds();
    await notifyUsers(sIds, {
      type: "DOCUMENTS_REQUIRED",
      title: `Document uploaded${input.actor.agencyName ? ` by ${input.actor.agencyName}` : ""}`,
      body: `${name} was uploaded to the document pool.`,
      link: `/admin/documents`,
    });
  }

  return doc;
}

export async function uploadResubmission(input: UploadDocumentInput & { originalDocumentId: string }) {
  const original = await getDocumentForUser(input.originalDocumentId, input.actor);
  if (original.doc.applicationId !== input.applicationId) throw new AppError("NOT_FOUND", "Document not found for this application.");
  if (!["REJECTED", "RESUBMISSION_REQUIRED"].includes(original.doc.status)) {
    throw new AppError("INVALID_STATE", "This document was not rejected; upload to the checklist instead.");
  }
  const doc = await uploadDocument({
    ...input,
    checklistItemId: original.doc.checklistItemId,
    documentTypeId: original.doc.documentTypeId,
  }, original.doc.id);
  return doc;
}

export interface ReviewInput {
  documentId: string;
  actor: AuthUser;
  status: Extract<DocumentStatus, "UNDER_REVIEW" | "ACCEPTED" | "REJECTED" | "RESUBMISSION_REQUIRED">;
  reviewNotes?: string | null;
  rejectionReason?: string | null;
  ipAddress?: string | null;
}

export async function reviewDocument(input: ReviewInput) {
  if (!isStaffRole(input.actor.role) || input.actor.agencyId || input.actor.mustChangePassword) {
    throw new AppError("FORBIDDEN", "Only ESSAFARIA staff can review documents.");
  }
  const rows = await db
    .select({
      doc: documents,
      documentTypeCode: documentTypes.code,
      appAgencyId: applications.agencyId,
      appReference: applications.reference,
    })
    .from(documents)
    .innerJoin(applications, eq(documents.applicationId, applications.id))
    .leftJoin(documentTypes, eq(documents.documentTypeId, documentTypes.id))
    .where(eq(documents.id, input.documentId))
    .limit(1);
  const row = rows[0];
  if (!row) throw new AppError("NOT_FOUND", "Document not found.");
  if (row.documentTypeCode?.startsWith("DECISION_")) {
    throw new AppError("DECISION_DOCUMENT_LOCKED", "Official decision documents cannot be changed through document review.");
  }

  const requiresReason = input.status === "REJECTED" || input.status === "RESUBMISSION_REQUIRED";
  const reason = input.rejectionReason?.trim() ?? "";
  if (requiresReason && reason.length < 5) {
    throw new AppError(
      "REASON_REQUIRED",
      "A rejection / resubmission reason (min 5 characters) is mandatory.",
    );
  }

  await db.transaction(async (tx) => {
  input = { ...input, actor: await currentOperationActor(tx,input.actor) };
  await tx
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
  }, tx);
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
  await db.transaction(async (tx) => {
  actor = await currentOperationActor(tx,actor);
  const [current] = await tx.select({ statusId: applications.statusId }).from(applications).where(eq(applications.id,row.doc.applicationId)).for("update");
  if (current?.statusId !== draft.id) throw new AppError("DELETE_NOT_ALLOWED", "Documents can only be removed while the application is a draft.");
  await tx.delete(documents).where(eq(documents.id, documentId));
  await recordAudit({
    actor,
    action: "DOCUMENT_DELETED",
    entity: "document",
    entityId: documentId,
    agencyId: row.appAgencyId,
    metadata: { filename: row.doc.originalFilename },
    ipAddress: ipAddress ?? null,
  }, tx);
  });
  await storageProvider().delete(row.doc.storageKey).catch(() => {});
}

export async function listApplicantsForApplication(applicationId: string) {
  return db
    .select()
    .from(applicants)
    .where(eq(applicants.applicationId, applicationId))
    .orderBy(asc(applicants.createdAt));
}

/**
 * Display grouping shared by the staff dossier and the agency portal.
 *
 * Documents are grouped by their checklist requirement. Anything that is not
 * linked to a checklist row of THIS application (older rows without a checklist
 * link, or a document whose requirement was later removed) is returned in
 * `unassigned` instead of being silently dropped — a document that exists but
 * renders nowhere was exactly how "staff cannot see the document the agency just
 * uploaded" happened. Both surfaces must render every row they receive.
 */
export function groupDocumentsForDisplay<
  T extends { doc: { checklistItemId: string | null; version: number; createdAt: Date | string } },
>(checklist: Array<{ id: string }>, rows: T[]): { byItem: Map<string, T[]>; unassigned: T[] } {
  const itemIds = new Set(checklist.map((c) => c.id));
  const byItem = new Map<string, T[]>();
  const unassigned: T[] = [];
  for (const row of rows) {
    const itemId = row.doc.checklistItemId;
    if (!itemId || !itemIds.has(itemId)) {
      unassigned.push(row);
      continue;
    }
    const bucket = byItem.get(itemId) ?? [];
    bucket.push(row);
    byItem.set(itemId, bucket);
  }
  const byVersionDesc = (a: T, b: T) =>
    b.doc.version - a.doc.version ||
    new Date(b.doc.createdAt).getTime() - new Date(a.doc.createdAt).getTime();
  for (const bucket of byItem.values()) bucket.sort(byVersionDesc);
  unassigned.sort(byVersionDesc);
  return { byItem, unassigned };
}

export async function getDocumentStatusCounts() {
  return db
    .select({ status: documents.status, count: sql<number>`count(*)::int` })
    .from(documents)
    .groupBy(documents.status);
}
