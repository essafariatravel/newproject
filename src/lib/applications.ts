import { qualifiedTable } from "./database-schema";
/**
 * Application service — creation, checklist, submission gate, status workflow.
 * All business rules execute server-side; callers are authenticated+authorized.
 */
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  applicants,
  agencies,
  auditLogs,
  notifications,
  communications,
  users,
  applicationStatusHistory,
  applications,
  checklistItems,
  countries,
  documentTypes,
  priorities,
  statusTransitions,
  statuses,
  visaCategories,
  visaRequirements,
  visaTypes,
  documentRequests,
} from "@/db/schema";
import { AppError, OVERRIDE_ROLES, type AuthUser, MAX_UPLOAD_BYTES, isStaffRole, isAgencyRole } from "@/lib/types";
import { fileNameProblem, fileNameErrorMessage } from "@/lib/filename";
import { validateDocumentFormat } from "@/lib/upload-validation";
import { chargeApplicationSubmission } from "@/lib/wallet";
import { recordAudit } from "@/lib/audit";
import { getEmbassyApplicability } from "@/lib/queries";
import { agencyUserIds, staffUserIds, notifyUsers } from "@/lib/notifications";
import { buildStorageKey, storageProvider } from "@/lib/storage";
import { documents } from "@/db/schema";

/* ------------------------------------------------------------------ */
/* Status helpers                                                      */
/* ------------------------------------------------------------------ */

export async function getStatusByCode(code: string) {
  const rows = await db.select().from(statuses).where(eq(statuses.code, code)).limit(1);
  const s = rows[0];
  if (!s) throw new AppError("CONFIG_ERROR", `Workflow status "${code}" is not configured.`);
  return s;
}

export async function listStatuses(activeOnly = false) {
  const q = db.select().from(statuses).orderBy(asc(statuses.sortOrder));
  return activeOnly ? q.where(eq(statuses.active, true)) : q;
}

export async function listPriorities(activeOnly = false) {
  const q = db.select().from(priorities).orderBy(asc(priorities.weight));
  return activeOnly ? q.where(eq(priorities.active, true)) : q;
}

export async function getPriorityByCode(code: string) {
  const rows = await db.select().from(priorities).where(eq(priorities.code, code)).limit(1);
  return rows[0] ?? null;
}

/* ------------------------------------------------------------------ */
/* References                                                          */
/* ------------------------------------------------------------------ */

function randomRef(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

async function generateReference(): Promise<string> {
  const year = new Date().getFullYear() % 100;
  for (let attempt = 0; attempt < 5; attempt++) {
    const ref = `EVT-${String(year).padStart(2, "0")}-${randomRef()}`;
    const existing = await db
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.reference, ref))
      .limit(1);
    if (!existing[0]) return ref;
  }
  throw new AppError("REFERENCE_COLLISION", "Could not allocate a reference. Try again.");
}

/* ------------------------------------------------------------------ */
/* Checklist                                                           */
/* ------------------------------------------------------------------ */

/** Snapshot the visa requirements of this visa type into checklist items. */
export async function generateChecklist(applicationId: string, visaTypeId: string, executor: Pick<typeof db, "select" | "insert"> = db): Promise<void> {
  const reqs = await executor
    .select({
      documentTypeId: documentTypes.id,
      name: documentTypes.name,
      code: documentTypes.code,
      required: visaRequirements.required,
      sortOrder: visaRequirements.sortOrder,
      notes: visaRequirements.notes,
    })
    .from(visaRequirements)
    .innerJoin(documentTypes, eq(visaRequirements.documentTypeId, documentTypes.id))
    .where(and(eq(visaRequirements.visaTypeId, visaTypeId), eq(visaRequirements.active, true)))
    .orderBy(asc(visaRequirements.sortOrder));
  if (reqs.length === 0) return;
  await executor
    .insert(checklistItems)
    .values(
      reqs.map((r) => ({
        applicationId,
        documentTypeId: r.documentTypeId,
        documentTypeName: r.name,
        documentTypeCode: r.code,
        required: r.required,
        sortOrder: r.sortOrder,
        notes: r.notes,
      })),
    )
    .onConflictDoNothing();
}

/**
 * Re-sync checklist for a still-draft application: requirements added to the
 * visa configuration since creation are appended; existing items are never
 * rewritten (historical integrity).
 */
export async function resyncChecklist(applicationId: string, visaTypeId: string): Promise<void> {
  await generateChecklist(applicationId, visaTypeId);
}

export interface ChecklistProgress {
  requiredTotal: number;
  requiredComplete: number;
  optionalTotal: number;
  optionalComplete: number;
}

/** A required item counts as complete when it has a document not rejected/awaiting resubmission. */
export async function checklistProgress(applicationId: string): Promise<ChecklistProgress> {
  const rows = await db
    .select({
      id: checklistItems.id,
      required: checklistItems.required,
      active: checklistItems.active,
      docStatus: sql<string | null>`(
        select d.status from ${sql.raw(qualifiedTable("documents"))} d
        where d.checklist_item_id = checklist_items.id
          and d.status in ('UPLOADED','UNDER_REVIEW','ACCEPTED')
        order by case d.status when 'ACCEPTED' then 0 when 'UNDER_REVIEW' then 1 else 2 end
        limit 1
      )`,
    })
    .from(checklistItems)
    .where(eq(checklistItems.applicationId, applicationId))
    .orderBy(asc(checklistItems.sortOrder));
  const progress: ChecklistProgress = {
    requiredTotal: 0,
    requiredComplete: 0,
    optionalTotal: 0,
    optionalComplete: 0,
  };
  for (const r of rows) {
    if (!r.active) continue;
    const done = r.docStatus !== null;
    if (r.required) {
      progress.requiredTotal++;
      if (done) progress.requiredComplete++;
    } else {
      progress.optionalTotal++;
      if (done) progress.optionalComplete++;
    }
  }
  return progress;
}

export async function getChecklist(applicationId: string) {
  return db
    .select()
    .from(checklistItems)
    .where(eq(checklistItems.applicationId, applicationId))
    .orderBy(asc(checklistItems.sortOrder), asc(checklistItems.createdAt));
}

/* ------------------------------------------------------------------ */
/* Creation                                                            */
/* ------------------------------------------------------------------ */

export async function getDefaultPriorityId(): Promise<string> {
  const p =
    (await getPriorityByCode("STANDARD")) ?? (await listPriorities(true))[0] ?? null;
  if (!p) throw new AppError("CONFIG_ERROR", "No priorities configured.");
  return p.id;
}

export interface CreateApplicationInput {
  agencyId: string;
  visaTypeId: string;
  priorityCode?: string | null;
  agencyNotes?: string | null;
  createdBy: AuthUser;
  ipAddress?: string | null;
}

/**
 * Creates a DRAFT application. Fee/processing/category/country are snapshotted
 * from the current visa configuration and never re-derived later.
 */
export async function createDraftApplication(input: CreateApplicationInput) {
  const actor = input.createdBy;
  if (actor.mustChangePassword || (actor.agencyId ? !isAgencyRole(actor.role) || actor.agencyId !== input.agencyId : !isStaffRole(actor.role))) {
    throw new AppError("FORBIDDEN", "You cannot create an application for this agency.");
  }
  const draftStatus = await getStatusByCode("DRAFT");
  const priorityId = input.priorityCode
    ? ((await getPriorityByCode(input.priorityCode))?.id ?? (await getDefaultPriorityId()))
    : await getDefaultPriorityId();
  const reference = await generateReference();
  const app = await db.transaction(async (tx) => {
    const [agency] = await tx.select({ id: agencies.id, status: agencies.status }).from(agencies).where(eq(agencies.id, input.agencyId)).for("share");
    if (!agency || agency.status !== "ACTIVE") throw new AppError("NOT_FOUND", "Agency not found or inactive.");
    const rows = await tx
      .select({ visaType: visaTypes, country: countries, category: visaCategories })
      .from(visaTypes)
      .innerJoin(countries, eq(visaTypes.countryId, countries.id))
      .innerJoin(visaCategories, eq(visaTypes.categoryId, visaCategories.id))
      .where(and(eq(visaTypes.id, input.visaTypeId), eq(visaTypes.active, true), eq(countries.active, true), eq(visaCategories.active, true), eq(visaTypes.currency, "DZD")))
      .limit(1)
      .for("share");
    const cfg = rows[0];
    if (!cfg) throw new AppError("NOT_FOUND", "Visa type not found or inactive.");
    const [created] = await tx.insert(applications).values({
      reference, agencyId: input.agencyId, countryId: cfg.country.id, visaTypeId: cfg.visaType.id,
      statusId: draftStatus.id, priorityId, visaTypeName: cfg.visaType.name, visaTypeCode: cfg.visaType.code,
      categoryName: cfg.category.name, countryName: cfg.country.name, fee: cfg.visaType.fee, currency: cfg.visaType.currency,
      processingMinDays: cfg.visaType.processingMinDays, processingMaxDays: cfg.visaType.processingMaxDays,
      agencyNotes: input.agencyNotes ?? null, createdBy: input.createdBy.id,
    }).returning();
    await generateChecklist(created!.id, created!.visaTypeId, tx);
    await tx.insert(auditLogs).values({
      actorId: input.createdBy.id,
      actorEmail: input.createdBy.email,
      actorRole: input.createdBy.role,
      agencyId: input.agencyId,
      action: "APPLICATION_CREATED",
      entity: "application",
      entityId: created!.id,
      metadata: { reference, visaTypeCode: created!.visaTypeCode, fee: created!.fee, currency: created!.currency },
      ipAddress: input.ipAddress ?? null,
    });
    return created!;
  });
  return app;
}

/* ------------------------------------------------------------------ */
/* Tenant-safe access                                                  */
/* ------------------------------------------------------------------ */

/** Load an application enforcing tenant isolation for agency users. */
export async function getApplicationForUser(applicationId: string, user: AuthUser) {
  const rows = await db
    .select({
      app: applications,
      status: statuses,
      priority: priorities,
      agencyName: sql<string>`(select coalesce(trading_name, legal_name) from ${sql.raw(qualifiedTable("agencies"))} where agencies.id = ${applications.agencyId})`,
    })
    .from(applications)
    .innerJoin(statuses, eq(applications.statusId, statuses.id))
    .innerJoin(priorities, eq(applications.priorityId, priorities.id))
    .where(eq(applications.id, applicationId))
    .limit(1);
  const row = rows[0];
  if (!row) throw new AppError("NOT_FOUND", "Application not found.");
  if (user.agencyId && row.app.agencyId !== user.agencyId) {
    throw new AppError("NOT_FOUND", "Application not found."); // tenant isolation
  }
  return row;
}

/* ------------------------------------------------------------------ */
/* Submission gate + submit                                            */
/* ------------------------------------------------------------------ */

export async function getSubmissionGate(applicationId: string) {
  const checklist = await db
    .select({
      item: checklistItems,
      docCount: sql<number>`(
        select count(*)::int from ${sql.raw(qualifiedTable("documents"))} d
        where d.checklist_item_id = checklist_items.id
          and d.status in ('UPLOADED','UNDER_REVIEW','ACCEPTED')
      )`,
    })
    .from(checklistItems)
    .where(
      and(
        eq(checklistItems.applicationId, applicationId),
        eq(checklistItems.required, true),
        eq(checklistItems.active, true),
      ),
    )
    .orderBy(asc(checklistItems.sortOrder));
  const missing = checklist.filter((r) => r.docCount === 0);
  return {
    ok: missing.length === 0,
    missing: missing.map((m) => m.item.documentTypeName),
    requiredTotal: checklist.length,
  };
}

export interface SubmitResult {
  reference: string;
  charge: { transactionId: string; balanceBefore: string; balanceAfter: string };
}

/**
 * Submit an application: enforce the document gate (staff may override with a
 * mandatory reason), verify applicant presence, then atomically charge the
 * wallet and flip status to SUBMITTED.
 */
export async function submitApplication(params: {
  applicationId: string;
  actor: AuthUser;
  overrideReason?: string | null;
  ipAddress?: string | null;
}): Promise<SubmitResult> {
  const { actor } = params;
  const row = await getApplicationForUser(params.applicationId, actor);
  const app = row.app;
  const draftStatus = await getStatusByCode("DRAFT");
  const submittedStatus = await getStatusByCode("SUBMITTED");
  if (app.statusId !== draftStatus.id) {
    throw new AppError("ALREADY_SUBMITTED", "This application has already been submitted.");
  }

  const applicantCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(applicants)
    .where(eq(applicants.applicationId, app.id));
  if ((applicantCount[0]?.count ?? 0) === 0) {
    throw new AppError("NO_APPLICANTS", "Add at least one applicant before submitting.");
  }

  let usedOverride = false;
  if (actor.agencyId) {
    const gate = await getSubmissionGate(app.id);
    if (!gate.ok) {
      throw new AppError(
        "CHECKLIST_INCOMPLETE",
        `Required documents missing: ${gate.missing.join(", ")}.`,
      );
    }
  } else {
    const gate = await getSubmissionGate(app.id);
    if (!gate.ok) {
      const canOverride = OVERRIDE_ROLES.includes(actor.role);
      if (!canOverride) {
        throw new AppError(
          "CHECKLIST_INCOMPLETE",
          `Required documents missing: ${gate.missing.join(", ")}.`,
        );
      }
      const reason = params.overrideReason?.trim();
      if (!reason || reason.length < 10) {
        throw new AppError(
          "OVERRIDE_REASON_REQUIRED",
          "A mandatory reason (min 10 characters) is required to override the document gate.",
        );
      }
      usedOverride = true;
      await db
        .update(applications)
        .set({ overrideReason: reason, overrideBy: actor.id, updatedAt: new Date() })
        .where(eq(applications.id, app.id));
    }
  }

  const charge = await chargeApplicationSubmission({
    applicationId: app.id,
    actorId: actor.id,
    submittedStatusId: submittedStatus.id,
    draftStatusId: draftStatus.id,
    ipAddress: params.ipAddress ?? null,
  });

  await recordAudit({
    actor,
    action: usedOverride ? "APPLICATION_SUBMITTED_OVERRIDE" : "APPLICATION_SUBMITTED",
    entity: "application",
    entityId: app.id,
    agencyId: app.agencyId,
    metadata: {
      reference: app.reference,
      fee: app.fee,
      currency: app.currency,
      ...(usedOverride ? { overrideReason: params.overrideReason } : {}),
    },
    ipAddress: params.ipAddress ?? null,
  });

  const sIds = await staffUserIds();
  await notifyUsers(sIds, {
    type: "APPLICATION_SUBMITTED",
    title: `Application ${app.reference} submitted`,
    body: `${row.agencyName ?? "An agency"} submitted ${app.visaTypeName} (${app.countryName}) with fee ${app.fee} ${app.currency}.`,
    link: `/admin/applications/${app.id}`,
    agencyId: app.agencyId,
    applicationId: app.id,
  });
  const aIds = await agencyUserIds(app.agencyId);
  await notifyUsers(aIds, {
    type: "APPLICATION_SUBMITTED",
    title: `Application ${app.reference} submitted`,
    body: `Your wallet was charged ${app.fee} ${app.currency}. You can track the application in your portal.`,
    link: `/portal/applications/${app.id}`,
    agencyId: app.agencyId,
    applicationId: app.id,
  });

  return { reference: app.reference, charge };
}

/* ------------------------------------------------------------------ */
/* Status transitions                                                  */
/* ------------------------------------------------------------------ */

const TERMINAL_TIMESTAMP_FIELDS: Record<string, "completedAt" | "decisionAt"> = {
  APPROVED: "decisionAt",
  REJECTED: "decisionAt",
  COMPLETED: "completedAt",
  // REFUSED is a legacy status (phase 2.1 canonical model kept the row for
  // history, transitioned nothing new into it).
};

/**
 * PHASE 2.1: final outcomes (APPROVED / REJECTED) may ONLY be reached
 * through `recordApplicationDecision` — the canonical workflow that uploads
 * the decision document and transitions the application in one atomic
 * operation. Direct status changes are hard-rejected here.
 * (REFUSED is a deactivated legacy status — the canonical negative outcome
 * is REJECTED.)
 */
/** §18 — statuses that represent the optional embassy stage. */
const EMBASSY_STATUS_CODES = new Set(["EMBASSY_SENT", "EMBASSY_SUBMISSION"]);

const DECISION_LOCKED_STATUSES = new Set(["APPROVED", "REJECTED"]);

export async function changeApplicationStatus(params: {
  applicationId: string;
  toStatusCode: string;
  reason?: string | null;
  actor: AuthUser;
  ipAddress?: string | null;
}) {
  const { actor } = params;
  const row = await getApplicationForUser(params.applicationId, actor);
  const app = row.app;

  const fromRows = await db.select().from(statuses).where(eq(statuses.id, app.statusId)).limit(1);
  const from = fromRows[0];
  if (!from) throw new AppError("CONFIG_ERROR", "Current status is not configured.");
  if (from.isTerminal) throw new AppError("BAD_STATE", "This application is closed.");

  const to = await getStatusByCode(params.toStatusCode);
  if (from.id === to.id) {
    throw new AppError("INVALID_TRANSITION", "Application is already in that status.");
  }

  if (DECISION_LOCKED_STATUSES.has(to.code)) {
    throw new AppError(
      "DECISION_REQUIRED",
      `${to.name} outcomes must be recorded through the final-decision panel: upload the decision document first.`,
    );
  }
  if (to.code === "SUBMITTED") throw new AppError("SUBMISSION_REQUIRED", "Submit this application through the submission workflow so its documents and wallet charge are recorded together.");
  if (to.isDraft) throw new AppError("INVALID_TRANSITION", "Submitted applications cannot return to a draft.");
  if (from.isDraft && to.code !== "CANCELLED") throw new AppError("SUBMISSION_REQUIRED", "Submit this application before it enters operational processing.");
  if (actor.mustChangePassword || (actor.agencyId && !(from.isDraft && to.code === "CANCELLED"))) throw new AppError("FORBIDDEN", "Only ESSAFARIA staff can perform operational status changes.");

  // §18 — the embassy stage is programme-driven, not a global step. A
  // programme that declares NOT_APPLICABLE can never be moved there, and the
  // guard lives here (server-side), not only in the UI.
  if (EMBASSY_STATUS_CODES.has(to.code)) {
    const applicability = await getEmbassyApplicability(app.visaTypeId);
    if (applicability === "NOT_APPLICABLE") {
      throw new AppError(
        "INVALID_TRANSITION",
        "This visa programme does not use an embassy stage. Move the application to processing or record the decision instead.",
      );
    }
  }

  const transition = await db
    .select()
    .from(statusTransitions)
    .where(and(eq(statusTransitions.fromStatusId, from.id), eq(statusTransitions.toStatusId, to.id)))
    .limit(1);
  const t = transition[0];
  if (!t || !from.active || !to.active) {
    throw new AppError(
      "INVALID_TRANSITION",
      `Transition ${from.code} → ${to.code} is not permitted.`,
    );
  }

  const isStaffWorkflow = isStaffRole(actor.role) && !actor.agencyId;
  const isAgencyRole = ["AGENCY_ADMIN", "AGENCY_USER"].includes(actor.role);
  const scopeOk =
    (t.scope === "STAFF" && isStaffWorkflow) ||
    (t.scope === "AGENCY" && isAgencyRole) ||
    (t.scope === "BOTH" && (isStaffWorkflow || isAgencyRole));
  if (!scopeOk) {
    throw new AppError("FORBIDDEN", "Your role cannot perform this status change.");
  }
  if (isAgencyRole && app.agencyId !== actor.agencyId) {
    throw new AppError("NOT_FOUND", "Application not found.");
  }

  const patch: Record<string, unknown> = { statusId: to.id, updatedAt: new Date() };
  const tsField = TERMINAL_TIMESTAMP_FIELDS[to.code];
  if (tsField) patch[tsField] = new Date();

  await db.transaction(async (tx) => {
    const [current] = await tx.select({ statusId: applications.statusId }).from(applications).where(eq(applications.id, app.id)).for("update");
    if (!current || current.statusId !== from.id) throw new AppError("BAD_STATE", "This application changed. Refresh before changing its status.");
    await tx.update(applications).set(patch).where(eq(applications.id, app.id));
    await tx.insert(applicationStatusHistory).values({
      applicationId: app.id,
      fromStatusId: from.id,
      toStatusId: to.id,
      changedBy: actor.id,
      reason: params.reason?.trim() || null,
    });
    if (to.isTerminal) await tx.update(documentRequests).set({ status: "CANCELLED", updatedAt: new Date() })
      .where(and(eq(documentRequests.applicationId, app.id), eq(documentRequests.status, "OPEN")));
    await tx.insert(auditLogs).values({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      agencyId: app.agencyId,
      action: "STATUS_CHANGED",
      entity: "application",
      entityId: app.id,
      metadata: { from: from.code, to: to.code, reason: params.reason ?? null },
      ipAddress: params.ipAddress ?? null,
    });
  });

  const aIds = await agencyUserIds(app.agencyId);
  await notifyUsers(aIds, {
    type: to.code === "COMPLETED" ? "APPLICATION_COMPLETED" : "STATUS_CHANGED",
    title: `Application ${app.reference}: ${to.name}`,
    body: params.reason?.trim()
      ? `Status changed from ${from.name} to ${to.name}. Note: ${params.reason.trim()}`
      : `Status changed from ${from.name} to ${to.name}.`,
    link: `/portal/applications/${app.id}`,
    agencyId: app.agencyId,
    applicationId: app.id,
  });
  if (to.code === "DOCUMENTS_REQUESTED") {
    await notifyUsers(aIds, {
      type: "DOCUMENTS_REQUIRED",
      title: `Documents required for ${app.reference}`,
      body: "ESSAFARIA requested additional documents. Check the checklist and upload them.",
      link: `/portal/applications/${app.id}`,
      agencyId: app.agencyId,
      applicationId: app.id,
    });
  }
  if (isAgencyRole) {
    const sIds = await staffUserIds();
    await notifyUsers(sIds, {
      type: "STATUS_CHANGED",
      title: `Application ${app.reference}: ${to.name}`,
      body: `${row.agencyName ?? "The agency"} changed the status from ${from.name} to ${to.name}.`,
      link: `/admin/applications/${app.id}`,
      agencyId: app.agencyId,
      applicationId: app.id,
    });
  }
  return { from: from.code, to: to.code };
}

/* ------------------------------------------------------------------ */
/* Final decisions (PHASE 2.1)                                         */
/* ------------------------------------------------------------------ */

export type DecisionOutcome = "APPROVED" | "REJECTED";

export const DECISION_DOC_TYPE_CODES = ["DECISION_VISA_APPROVAL", "DECISION_REFUSAL_LETTER"] as const;

/**
 * From-statuses allowed for each outcome. Final outcomes can only be recorded
 * while the application is in genuine production; anything earlier is a bad
 * state and anything later (terminal) is finished. APPROVED additionally
 * stays double-gated by workflow CONFIG: if the app isn't awaiting decision
 * on paper yet, the approver moves it there first.
 */
const DECISION_SOURCES: Record<string, DecisionOutcome[]> = {
  IN_PROCESS: ["APPROVED", "REJECTED"],
  EMBASSY_SENT: ["APPROVED", "REJECTED"],
};

/** Outcomes the admin UI is allowed to offer for a given status code. */
export function decisionOutcomesForStatus(statusCode: string): DecisionOutcome[] {
  return DECISION_SOURCES[statusCode] ?? [];
}

function documentTypeForOutcome(outcome: DecisionOutcome): string {
  return outcome === "APPROVED" ? "DECISION_VISA_APPROVAL" : "DECISION_REFUSAL_LETTER";
}

/** Decision documents recorded for an application (for admin + portal views). */
export async function getDecisionDocuments(applicationId: string) {
  return db
    .select({
      id: documents.id,
      originalFilename: documents.originalFilename,
      mimeType: documents.mimeType,
      sizeBytes: documents.sizeBytes,
      status: documents.status,
      createdAt: documents.createdAt,
      typeCode: documentTypes.code,
      typeName: documentTypes.name,
    })
    .from(documents)
    .innerJoin(documentTypes, eq(documents.documentTypeId, documentTypes.id))
    .where(and(eq(documents.applicationId, applicationId), inArray(documentTypes.code, [...DECISION_DOC_TYPE_CODES])))
    .orderBy(desc(documents.createdAt));
}

/**
 * Canonical final-decision workflow. Atomically (single DB transaction):
 * stores the validated decision document as an ACCEPTED system document
 * (decision-specific document type, no applicant/checklist linkage) and
 * transitions the application to the agreed outcome, stamping decision_at
 * and the status-history trail. Storage pre-stages the blob first so a
 * failed transaction never leaves a half-visible decision; retry is safe.
 */
interface DecisionInput {
  applicationId: string; outcome: DecisionOutcome; actor: AuthUser;
  file?: { name: string; type: string; size: number; data: Buffer };
  note?: string | null; ipAddress?: string | null;
}
export async function recordApplicationDecision(params: DecisionInput): Promise<{ documentId: string; statusCode: string }> {
  const { actor, file: f } = params;
  if (!isStaffRole(actor.role) || actor.agencyId || actor.mustChangePassword) {
    throw new AppError("FORBIDDEN", "Only ESSAFARIA staff can record application decisions.");
  }
  if (!["APPROVED", "REJECTED"].includes(params.outcome)) throw new AppError("VALIDATION", "Choose a final decision.");
  const note = params.note?.trim() || null;
  if (note && note.length > 4000) throw new AppError("VALIDATION", "The note is too long.");
  if (!f) throw new AppError("NO_FILE", "Select the official approval or refusal document before recording the decision.");
  {
    if (f.size <= 0 || !f.data.length) throw new AppError("NO_FILE", "The uploaded file is empty.");
    if (f.size > MAX_UPLOAD_BYTES || f.data.length > MAX_UPLOAD_BYTES) throw new AppError("UPLOAD_TOO_LARGE", "Files must be 2 MB or smaller.");
    const problem = fileNameProblem(f.name);
    if (problem) throw new AppError("INVALID_FILENAME", fileNameErrorMessage(problem));
    if (!["application/pdf", "image/jpeg", "image/png"].includes(f.type)) throw new AppError("UPLOAD_TYPE", "Only matching PDF, JPG or PNG decision documents are accepted.");
    try { validateDocumentFormat(f); } catch { throw new AppError("UPLOAD_TYPE", "Only matching PDF, JPG or PNG decision documents are accepted."); }
  }
  const app = (await getApplicationForUser(params.applicationId, actor)).app;
  const documentId = crypto.randomUUID();
  const storageKey = buildStorageKey(app.id, documentId);
  await storageProvider().put(storageKey, f.data, f.type);
  try {
    return await db.transaction(async (tx) => {
      const [locked] = await tx.select().from(applications).where(eq(applications.id, app.id)).for("update");
      if (!locked) throw new AppError("NOT_FOUND", "Application not found.");
      const [from] = await tx.select().from(statuses).where(eq(statuses.id, locked.statusId));
      const [to] = await tx.select().from(statuses).where(and(eq(statuses.code, params.outcome), eq(statuses.active, true)));
      if (!from || !to) throw new AppError("CONFIG_ERROR", "Decision workflow is not configured.");
      if (!(DECISION_SOURCES[from.code] ?? []).includes(params.outcome)) {
        throw new AppError("BAD_STATE", "The application must be in Processing or at the Embassy and must not already be decided.");
      }
      const [programme] = await tx.select({ applicability: visaTypes.embassyApplicability }).from(visaTypes).where(eq(visaTypes.id, locked.visaTypeId));
      if (programme?.applicability === "APPLICABLE" && from.code !== "EMBASSY_SENT") throw new AppError("EMBASSY_REQUIRED", "This programme requires the embassy stage before its final decision.");
      const [transition] = await tx.select().from(statusTransitions).where(and(
        eq(statusTransitions.fromStatusId, from.id), eq(statusTransitions.toStatusId, to.id),
      ));
      if (!transition || !["STAFF", "BOTH"].includes(transition.scope)) throw new AppError("BAD_STATE", "This decision is not allowed by the configured workflow.");
      const now = new Date();
      {
        const [dt] = await tx.select().from(documentTypes).where(and(eq(documentTypes.code, documentTypeForOutcome(params.outcome)), eq(documentTypes.active, true)));
        if (!dt) throw new AppError("CONFIG_ERROR", "Decision document type is not available.");
        await tx.insert(documents).values({ id: documentId, applicationId: app.id, documentTypeId: dt.id,
          originalFilename: f.name, mimeType: f.type, sizeBytes: f.data.length, storageKey, status: "ACCEPTED",
          uploadedBy: actor.id, version: 1, reviewedBy: actor.id, reviewedAt: now,
          reviewNotes: "Official decision document",
        });
      }
      await tx.update(applications).set({ statusId: to.id, decisionAt: now, updatedAt: now }).where(eq(applications.id, app.id));
      await tx.update(documentRequests).set({ status: "CANCELLED", updatedAt: now })
        .where(and(eq(documentRequests.applicationId, app.id), eq(documentRequests.status, "OPEN")));
      await tx.insert(applicationStatusHistory).values({ applicationId: app.id, fromStatusId: from.id,
        toStatusId: to.id, changedBy: actor.id, reason: note ?? `Final decision: ${to.name}`,
      });
      if (note) await tx.insert(communications).values({ applicationId: app.id, authorId: actor.id, visibility: "AGENCY", body: note });
      await tx.insert(auditLogs).values({ actorId: actor.id, actorEmail: actor.email, actorRole: actor.role,
        agencyId: app.agencyId, action: "APPLICATION_DECISION_RECORDED", entity: "application", entityId: app.id,
        metadata: { outcome: params.outcome, documentId, from: from.code }, ipAddress: params.ipAddress ?? null,
      });
      const recipients = await tx.select({ id: users.id, agencyId: users.agencyId }).from(users)
        .where(sql`${users.status} = 'ACTIVE' and (${users.agencyId} = ${app.agencyId} or ${users.agencyId} is null)`);
      const events = recipients.filter((u) => u.id !== actor.id).map((u) => ({ userId: u.id,
        agencyId: app.agencyId, applicationId: app.id, type: "APPLICATION_DECISION",
        title: `Application ${app.reference}: ${to.name}`, body: note ?? to.name,
        link: `/${u.agencyId ? "portal" : "admin"}/applications/${app.id}`,
      }));
      if (events.length) await tx.insert(notifications).values(events);
      return { documentId, statusCode: to.code };
    });
  } catch (error) {
    await storageProvider().delete(storageKey).catch(() => {});
    throw error;
  }
}

/* ------------------------------------------------------------------ */
/* Activity                                                            */
/* ------------------------------------------------------------------ */

export async function getStatusHistory(applicationId: string) {
  return db
    .select({
      history: applicationStatusHistory,
      toStatus: { code: statuses.code, name: statuses.name },
    })
    .from(applicationStatusHistory)
    .innerJoin(statuses, eq(applicationStatusHistory.toStatusId, statuses.id))
    .where(eq(applicationStatusHistory.applicationId, applicationId))
    .orderBy(desc(applicationStatusHistory.createdAt));
}

export async function listTransitions() {
  return db
    .select({
      fromCode: sql<string>`f.code`,
      fromName: sql<string>`f.name`,
      toCode: sql<string>`t.code`,
      toName: sql<string>`t.name`,
      scope: statusTransitions.scope,
    })
    .from(statusTransitions)
    .innerJoin(sql`${sql.raw(qualifiedTable("statuses"))} f`, sql`f.id = ${statusTransitions.fromStatusId}`)
    .innerJoin(sql`${sql.raw(qualifiedTable("statuses"))} t`, sql`t.id = ${statusTransitions.toStatusId}`)
    .orderBy(asc(sql`f.sort_order`), asc(sql`t.sort_order`));
}

/** Allowed next statuses for the UI. */
export async function allowedNextStatuses(fromStatusId: string, role: AuthUser["role"]) {
  const [from] = await db.select({ draft: statuses.isDraft, terminal: statuses.isTerminal }).from(statuses).where(eq(statuses.id, fromStatusId));
  if (!from || from.terminal) return [];
  const rows = await db
    .select({ status: statuses, scope: statusTransitions.scope })
    .from(statusTransitions)
    .innerJoin(statuses, eq(statusTransitions.toStatusId, statuses.id))
    .where(and(eq(statusTransitions.fromStatusId, fromStatusId), eq(statuses.active, true)))
    .orderBy(asc(statuses.sortOrder));
  const isStaffWorkflow = isStaffRole(role);
  const isAgencyRole = ["AGENCY_ADMIN", "AGENCY_USER"].includes(role);
  return rows.filter((r) => !r.status.isDraft && !["SUBMITTED", "APPROVED", "REJECTED"].includes(r.status.code))
    .filter((r) => (!from.draft || r.status.code === "CANCELLED") && (!isAgencyRole || (from.draft && r.status.code === "CANCELLED"))).filter((r) =>
    r.scope === "BOTH"
      ? isStaffWorkflow || isAgencyRole
      : r.scope === "STAFF"
        ? isStaffWorkflow
        : isAgencyRole,
  );
}

/** Applications eligible for checklist re-sync (still drafts). */
export async function draftApplicationIdsForVisaType(visaTypeId: string): Promise<string[]> {
  const draft = await getStatusByCode("DRAFT");
  const rows = await db
    .select({ id: applications.id })
    .from(applications)
    .where(and(eq(applications.visaTypeId, visaTypeId), inArray(applications.statusId, [draft.id])));
  return rows.map((r) => r.id);
}
