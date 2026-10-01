import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, statuses, checklistItems, documentRequests, documentTypes } from "@/db/schema";
import { AppError, type AuthUser, isStaffRole } from "@/lib/types";
import { recordAudit } from "@/lib/audit";
import { agencyUserIds, notifyUsers } from "@/lib/notifications";
import { assertApplicationAccess } from "@/lib/documents";

export async function listDocumentRequests(applicationId: string) {
  return db
    .select({
      req: documentRequests,
      docTypeName: documentTypes.name,
      docTypeCode: documentTypes.code,
    })
    .from(documentRequests)
    .innerJoin(documentTypes, eq(documentRequests.documentTypeId, documentTypes.id))
    .where(eq(documentRequests.applicationId, applicationId))
    .orderBy(desc(documentRequests.createdAt));
}

export async function listOpenRequestsForApplication(applicationId: string) {
  return db
    .select()
    .from(documentRequests)
    .where(and(eq(documentRequests.applicationId, applicationId), eq(documentRequests.status, "OPEN")));
}

/**
 * Document types an AGENCY can be asked to provide.
 * Decision documents (the issued visa / approval) are issued by ESSAFARIA and
 * must never be requested from — or uploaded by — an agency.
 */
export function isAgencyRequestableType(type: { agencyUploadable?: boolean | null } | null | undefined) {
  return type?.agencyUploadable !== false;
}

export async function listAgencyRequestableDocumentTypes() {
  return db
    .select({
      id: documentTypes.id,
      name: documentTypes.name,
      code: documentTypes.code,
      description: documentTypes.description,
    })
    .from(documentTypes)
    .where(and(eq(documentTypes.active, true), eq(documentTypes.agencyUploadable, true)))
    .orderBy(asc(documentTypes.sortOrder));
}

export interface RequestReplacementInput {
  applicationId: string;
  checklistItemId: string;
  reason: string;
  actor: AuthUser;
  ipAddress?: string | null;
}

export async function requestDocumentReplacement(input: RequestReplacementInput) {
  if (!isStaffRole(input.actor.role) || input.actor.agencyId || input.actor.mustChangePassword) {
    throw new AppError("FORBIDDEN", "Only staff can request document replacements.");
  }
  const access = await assertApplicationAccess(input.applicationId, input.actor);
  if (access.isTerminal) {
    throw new AppError("INVALID_STATE", "Document requests cannot be created for a closed application.");
  }

  const created = await db.transaction(async (tx) => {
    const [app] = await tx.select().from(applications).where(eq(applications.id, input.applicationId)).for("update");
    if (!app) throw new AppError("NOT_FOUND", "Application not found.");
    const [status] = await tx.select().from(statuses).where(eq(statuses.id, app.statusId));
    if (!status || status.isTerminal) throw new AppError("INVALID_STATE", "Document requests cannot be created for a closed application.");
  const itemRows = await tx
    .select()
    .from(checklistItems)
    .where(and(eq(checklistItems.id, input.checklistItemId), eq(checklistItems.applicationId, input.applicationId)))
    .limit(1);
  const item = itemRows[0];
  if (!item) throw new AppError("NOT_FOUND", "Checklist item not found.");
  if (!item.documentTypeId) throw new AppError("VALIDATION", "Checklist item has no document type.");
  const typeRows = await tx
    .select({ active: documentTypes.active, agencyUploadable: documentTypes.agencyUploadable, name: documentTypes.name })
    .from(documentTypes)
    .where(eq(documentTypes.id, item.documentTypeId))
    .limit(1);
  if (!typeRows[0]?.active || !isAgencyRequestableType(typeRows[0])) {
    throw new AppError(
      "VALIDATION",
      `"${typeRows[0]?.name ?? "This document"}" is issued by ESSAFARIA, not provided by the agency.`,
    );
  }

  const reason = input.reason.trim();
  if (reason.length < 5 || reason.length > 1000) throw new AppError("VALIDATION", "Reason must be between 5 and 1000 characters.");

  // Cancel any previous open replacement for same checklist item
  await tx
    .update(documentRequests)
    .set({ status: "CANCELLED", updatedAt: new Date() })
    .where(
      and(
        eq(documentRequests.applicationId, input.applicationId),
        eq(documentRequests.documentTypeId, item.documentTypeId),
        eq(documentRequests.status, "OPEN"),
      ),
    );

  const inserted = await tx
    .insert(documentRequests)
    .values({
      applicationId: input.applicationId,
      checklistItemId: item.id,
      documentTypeId: item.documentTypeId,
      type: "REPLACEMENT",
      status: "OPEN",
      reason,
      requestedBy: input.actor.id,
    })
    .returning();
  return { request: inserted[0]!, item };
  });
  const { request, item } = created;

  await recordAudit({
    actor: input.actor,
    action: "DOCUMENT_REPLACEMENT_REQUESTED",
    entity: "document_request",
    entityId: request.id,
    agencyId: access.agencyId,
    metadata: { checklistItemId: item.id, documentTypeCode: item.documentTypeCode, reason: request.reason },
    ipAddress: input.ipAddress ?? null,
  });

  const aIds = await agencyUserIds(access.agencyId);
  await notifyUsers(aIds, {
    type: "DOCUMENT_REQUESTED",
    title: `Action required — ${item.documentTypeName} replacement requested`,
    body: request.reason,
    link: `/portal/applications/${input.applicationId}?tab=documents#request-${request.id}`,
    agencyId: access.agencyId,
    applicationId: input.applicationId,
    documentRequestId: request.id,
  });

  return request;
}

export interface RequestAdditionalInput {
  applicationId: string;
  documentTypeId: string;
  reason: string;
  actor: AuthUser;
  ipAddress?: string | null;
}

export async function requestAdditionalDocument(input: RequestAdditionalInput) {
  if (!isStaffRole(input.actor.role) || input.actor.agencyId || input.actor.mustChangePassword) {
    throw new AppError("FORBIDDEN", "Only staff can request additional documents.");
  }
  const access = await assertApplicationAccess(input.applicationId, input.actor);
  if (access.isTerminal) {
    throw new AppError("INVALID_STATE", "Document requests cannot be created for a closed application.");
  }

  const created = await db.transaction(async (tx) => {
    const [app] = await tx.select().from(applications).where(eq(applications.id, input.applicationId)).for("update");
    if (!app) throw new AppError("NOT_FOUND", "Application not found.");
    const [status] = await tx.select().from(statuses).where(eq(statuses.id, app.statusId));
    if (!status || status.isTerminal) throw new AppError("INVALID_STATE", "Document requests cannot be created for a closed application.");
  const dtRows = await tx
    .select()
    .from(documentTypes)
    .where(eq(documentTypes.id, input.documentTypeId))
    .limit(1);
  const dt = dtRows[0];
  if (!dt?.active) throw new AppError("NOT_FOUND", "Document type not found or inactive.");
  if (!isAgencyRequestableType(dt)) {
    throw new AppError(
      "VALIDATION",
      `"${dt.name}" is issued by ESSAFARIA, not provided by the agency — it cannot be requested as an additional document.`,
    );
  }

  const reason = input.reason.trim();
  if (reason.length < 5 || reason.length > 1000) throw new AppError("VALIDATION", "Reason must be between 5 and 1000 characters.");

  // Ensure checklist item exists for this doc type (create if needed)
  let checklistItemId: string | null = null;
  const existingChecklist = await tx
    .select()
    .from(checklistItems)
    .where(and(eq(checklistItems.applicationId, input.applicationId), eq(checklistItems.documentTypeId, dt.id)))
    .limit(1);
  if (existingChecklist[0]) {
    checklistItemId = existingChecklist[0].id;
  } else {
    const insertedChecklist = await tx
      .insert(checklistItems)
      .values({
        applicationId: input.applicationId,
        documentTypeId: dt.id,
        documentTypeName: dt.name,
        documentTypeCode: dt.code,
        required: true,
        sortOrder: 1000,
        notes: reason,
        active: true,
      })
      .returning();
    checklistItemId = insertedChecklist[0]!.id;
  }

  // Cancel previous open additional for same type
  await tx
    .update(documentRequests)
    .set({ status: "CANCELLED", updatedAt: new Date() })
    .where(
      and(
        eq(documentRequests.applicationId, input.applicationId),
        eq(documentRequests.documentTypeId, dt.id),
        eq(documentRequests.status, "OPEN"),
      ),
    );

  const inserted = await tx
    .insert(documentRequests)
    .values({
      applicationId: input.applicationId,
      checklistItemId,
      documentTypeId: dt.id,
      type: "ADDITIONAL",
      status: "OPEN",
      reason,
      requestedBy: input.actor.id,
    })
    .returning();
    return { request: inserted[0]!, dt };
  });
  const { request, dt } = created;

  await recordAudit({
    actor: input.actor,
    action: "DOCUMENT_ADDITIONAL_REQUESTED",
    entity: "document_request",
    entityId: request.id,
    agencyId: access.agencyId,
    metadata: { documentTypeCode: dt.code, reason: request.reason },
    ipAddress: input.ipAddress ?? null,
  });

  const aIds = await agencyUserIds(access.agencyId);
  await notifyUsers(aIds, {
    type: "DOCUMENT_REQUESTED",
    title: `Action required — additional document ${dt.name} requested`,
    body: request.reason,
    link: `/portal/applications/${input.applicationId}?tab=documents#request-${request.id}`,
    agencyId: access.agencyId,
    applicationId: input.applicationId,
    documentRequestId: request.id,
  });

  return request;
}
