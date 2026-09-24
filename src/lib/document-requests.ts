import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { checklistItems, documentRequests, documentTypes } from "@/db/schema";
import { AppError, type AuthUser, DOCUMENT_REVIEW_ROLES } from "@/lib/types";
import { recordAudit } from "@/lib/audit";
import { agencyUserIds, notifyUsers } from "@/lib/notifications";
import { assertApplicationAccess } from "@/lib/documents";

export async function listDocumentRequests(applicationId: string) {
  return db
    .select({
      req: documentRequests,
      docTypeName: documentTypes.name,
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
  if (!DOCUMENT_REVIEW_ROLES.includes(input.actor.role)) {
    throw new AppError("FORBIDDEN", "Only staff can request document replacements.");
  }
  const access = await assertApplicationAccess(input.applicationId, input.actor);

  const itemRows = await db
    .select()
    .from(checklistItems)
    .where(and(eq(checklistItems.id, input.checklistItemId), eq(checklistItems.applicationId, input.applicationId)))
    .limit(1);
  const item = itemRows[0];
  if (!item) throw new AppError("NOT_FOUND", "Checklist item not found.");
  if (!item.documentTypeId) throw new AppError("VALIDATION", "Checklist item has no document type.");
  const typeRows = await db
    .select({ agencyUploadable: documentTypes.agencyUploadable, name: documentTypes.name })
    .from(documentTypes)
    .where(eq(documentTypes.id, item.documentTypeId))
    .limit(1);
  if (!isAgencyRequestableType(typeRows[0])) {
    throw new AppError(
      "VALIDATION",
      `"${typeRows[0]?.name ?? "This document"}" is issued by ESSAFARIA, not provided by the agency.`,
    );
  }

  const reason = input.reason.trim();
  if (reason.length < 5) throw new AppError("VALIDATION", "Reason must be at least 5 characters.");

  // Cancel any previous open replacement for same checklist item
  await db
    .update(documentRequests)
    .set({ status: "CANCELLED", updatedAt: new Date() })
    .where(
      and(
        eq(documentRequests.applicationId, input.applicationId),
        eq(documentRequests.checklistItemId, input.checklistItemId),
        eq(documentRequests.status, "OPEN"),
      ),
    );

  const inserted = await db
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

  await recordAudit({
    actor: input.actor,
    action: "DOCUMENT_REPLACEMENT_REQUESTED",
    entity: "document_request",
    entityId: inserted[0]!.id,
    agencyId: access.agencyId,
    metadata: { checklistItemId: item.id, documentTypeCode: item.documentTypeCode, reason },
    ipAddress: input.ipAddress ?? null,
  });

  const aIds = await agencyUserIds(access.agencyId);
  await notifyUsers(aIds, {
    type: "DOCUMENT_REQUESTED",
    title: `Action required — ${item.documentTypeName} replacement requested`,
    body: reason,
    link: `/portal/applications/${input.applicationId}`,
    agencyId: access.agencyId,
    applicationId: input.applicationId,
  });

  return inserted[0]!;
}

export interface RequestAdditionalInput {
  applicationId: string;
  documentTypeId: string;
  reason: string;
  actor: AuthUser;
  ipAddress?: string | null;
}

export async function requestAdditionalDocument(input: RequestAdditionalInput) {
  if (!DOCUMENT_REVIEW_ROLES.includes(input.actor.role)) {
    throw new AppError("FORBIDDEN", "Only staff can request additional documents.");
  }
  const access = await assertApplicationAccess(input.applicationId, input.actor);

  const dtRows = await db
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
  if (reason.length < 5) throw new AppError("VALIDATION", "Reason must be at least 5 characters.");

  // Ensure checklist item exists for this doc type (create if needed)
  let checklistItemId: string | null = null;
  const existingChecklist = await db
    .select()
    .from(checklistItems)
    .where(and(eq(checklistItems.applicationId, input.applicationId), eq(checklistItems.documentTypeId, dt.id)))
    .limit(1);
  if (existingChecklist[0]) {
    checklistItemId = existingChecklist[0].id;
  } else {
    const insertedChecklist = await db
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
  await db
    .update(documentRequests)
    .set({ status: "CANCELLED", updatedAt: new Date() })
    .where(
      and(
        eq(documentRequests.applicationId, input.applicationId),
        eq(documentRequests.documentTypeId, dt.id),
        eq(documentRequests.type, "ADDITIONAL"),
        eq(documentRequests.status, "OPEN"),
      ),
    );

  const inserted = await db
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

  await recordAudit({
    actor: input.actor,
    action: "DOCUMENT_ADDITIONAL_REQUESTED",
    entity: "document_request",
    entityId: inserted[0]!.id,
    agencyId: access.agencyId,
    metadata: { documentTypeCode: dt.code, reason },
    ipAddress: input.ipAddress ?? null,
  });

  const aIds = await agencyUserIds(access.agencyId);
  await notifyUsers(aIds, {
    type: "DOCUMENT_REQUESTED",
    title: `Action required — additional document ${dt.name} requested`,
    body: reason,
    link: `/portal/applications/${input.applicationId}`,
    agencyId: access.agencyId,
    applicationId: input.applicationId,
  });

  return inserted[0]!;
}

export async function fulfillDocumentRequest(params: {
  requestId: string;
  documentId: string;
  actor: AuthUser;
}) {
  const reqRows = await db.select().from(documentRequests).where(eq(documentRequests.id, params.requestId)).limit(1);
  const req = reqRows[0];
  if (!req) throw new AppError("NOT_FOUND", "Document request not found.");
  if (req.status !== "OPEN") throw new AppError("INVALID_STATE", "Request is not open.");

  await db
    .update(documentRequests)
    .set({
      status: "FULFILLED",
      fulfilledBy: params.actor.id,
      fulfilledDocumentId: params.documentId,
      fulfilledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(documentRequests.id, params.requestId));
}
