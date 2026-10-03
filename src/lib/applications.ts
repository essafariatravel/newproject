import { qualifiedTable } from "./database-schema";
/**
 * Application service — creation, checklist, submission gate, status workflow.
 * All business rules execute server-side; callers are authenticated+authorized.
 */
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  applicants,
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
} from "@/db/schema";
import { AppError, OVERRIDE_ROLES, type AuthUser, MAX_UPLOAD_BYTES } from "@/lib/types";
import { chargeApplicationSubmission } from "@/lib/wallet";
import { recordAudit } from "@/lib/audit";
import { getEmbassyApplicability } from "@/lib/queries";
import { agencyUserIds, staffUserIds, notifyUsersBestEffort } from "@/lib/notifications";
import { buildStorageKey, storageProvider } from "@/lib/storage";
import { documents } from "@/db/schema";
import { logErrorOnce, logEvent, pseudonymizeIdentifier } from "@/lib/observability";

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
export async function generateChecklist(applicationId: string, visaTypeId: string): Promise<void> {
  const reqs = await db
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
  await db
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
  const rows = await db
    .select({
      visaType: visaTypes,
      country: countries,
      category: visaCategories,
    })
    .from(visaTypes)
    .innerJoin(countries, eq(visaTypes.countryId, countries.id))
    .innerJoin(visaCategories, eq(visaTypes.categoryId, visaCategories.id))
    .where(and(eq(visaTypes.id, input.visaTypeId), eq(visaTypes.active, true)))
    .limit(1);
  const cfg = rows[0];
  if (!cfg) throw new AppError("NOT_FOUND", "Visa type not found or inactive.");

  const draftStatus = await getStatusByCode("DRAFT");
  const priorityId = input.priorityCode
    ? ((await getPriorityByCode(input.priorityCode))?.id ?? (await getDefaultPriorityId()))
    : await getDefaultPriorityId();

  const reference = await generateReference();
  const inserted = await db
    .insert(applications)
    .values({
      reference,
      agencyId: input.agencyId,
      countryId: cfg.country.id,
      visaTypeId: cfg.visaType.id,
      statusId: draftStatus.id,
      priorityId,
      visaTypeName: cfg.visaType.name,
      visaTypeCode: cfg.visaType.code,
      categoryName: cfg.category.name,
      countryName: cfg.country.name,
      fee: cfg.visaType.fee,
      currency: cfg.visaType.currency,
      processingMinDays: cfg.visaType.processingMinDays,
      processingMaxDays: cfg.visaType.processingMaxDays,
      agencyNotes: input.agencyNotes ?? null,
      createdBy: input.createdBy.id,
    })
    .returning();
  const app = inserted[0]!;
  await generateChecklist(app.id, app.visaTypeId);
  await recordAudit({
    actor: input.createdBy,
    action: "APPLICATION_CREATED",
    entity: "application",
    entityId: app.id,
    agencyId: input.agencyId,
    metadata: { reference, visaTypeCode: app.visaTypeCode, fee: app.fee, currency: app.currency },
    ipAddress: input.ipAddress ?? null,
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
    logEvent({
      eventName: "security.cross_tenant_access.denied",
      severity: "warning",
      classification: "SAFE_PREVENTION",
      result: "denied",
      errorCode: "NOT_FOUND",
      actorRole: user.role,
      tenantRef: pseudonymizeIdentifier(user.agencyId),
      resourceType: "application",
      resourceRef: pseudonymizeIdentifier(applicationId),
      metadata: { target_tenant_ref: pseudonymizeIdentifier(row.app.agencyId) },
    });
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
  const submitStartedAt = Date.now();
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

  logEvent({
    eventName: "application.submission.succeeded",
    result: "succeeded",
    actorRole: actor.role,
    tenantRef: pseudonymizeIdentifier(app.agencyId),
    resourceType: "application",
    resourceRef: pseudonymizeIdentifier(app.id),
    metadata: { override_used: usedOverride },
    durationMs: Date.now() - submitStartedAt,
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

  await notifyUsersBestEffort(
    staffUserIds(),
    {
      type: "APPLICATION_SUBMITTED",
      title: `Application ${app.reference} submitted`,
      body: `${row.agencyName ?? "An agency"} submitted ${app.visaTypeName} (${app.countryName}) with fee ${app.fee} ${app.currency}.`,
      link: `/admin/applications/${app.id}`,
      agencyId: app.agencyId,
      applicationId: app.id,
    },
    {
      actorRole: actor.role,
      tenantRef: pseudonymizeIdentifier(app.agencyId),
      resourceType: "application",
      resourceRef: pseudonymizeIdentifier(app.id),
    },
  );
  await notifyUsersBestEffort(
    agencyUserIds(app.agencyId),
    {
      type: "APPLICATION_SUBMITTED",
      title: `Application ${app.reference} submitted`,
      body: `Your wallet was charged ${app.fee} ${app.currency}. You can track the application in your portal.`,
      link: `/portal/applications/${app.id}`,
      agencyId: app.agencyId,
      applicationId: app.id,
    },
    {
      actorRole: actor.role,
      tenantRef: pseudonymizeIdentifier(app.agencyId),
      resourceType: "application",
      resourceRef: pseudonymizeIdentifier(app.id),
    },
  );

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
  /** internal: set by the decision workflow only */
  viaDecision?: boolean;
}) {
  const transitionStartedAt = Date.now();
  const { actor } = params;
  const row = await getApplicationForUser(params.applicationId, actor);
  const app = row.app;

  const fromRows = await db.select().from(statuses).where(eq(statuses.id, app.statusId)).limit(1);
  const from = fromRows[0];
  if (!from) throw new AppError("CONFIG_ERROR", "Current status is not configured.");

  const to = await getStatusByCode(params.toStatusCode);
  if (from.id === to.id) {
    throw new AppError("INVALID_TRANSITION", "Application is already in that status.");
  }

  if (!params.viaDecision && DECISION_LOCKED_STATUSES.has(to.code)) {
    logEvent({
      eventName: "application.status_transition.prevented",
      severity: "warning",
      classification: "SAFE_PREVENTION",
      result: "prevented",
      errorCode: "DECISION_REQUIRED",
      actorRole: actor.role,
      tenantRef: pseudonymizeIdentifier(app.agencyId),
      resourceType: "application",
      resourceRef: pseudonymizeIdentifier(app.id),
      metadata: { from: from.code, to: to.code },
      durationMs: Date.now() - transitionStartedAt,
    });
    throw new AppError(
      "DECISION_REQUIRED",
      `${to.name} outcomes must be recorded through the final-decision panel: upload the decision document first.`,
    );
  }

  // §18 — the embassy stage is programme-driven, not a global step. A
  // programme that declares NOT_APPLICABLE can never be moved there, and the
  // guard lives here (server-side), not only in the UI.
  if (EMBASSY_STATUS_CODES.has(to.code) && !params.viaDecision) {
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

  const isStaffWorkflow = ["SUPER_ADMIN", "ADMIN", "VISA_AGENT"].includes(actor.role);
  const isAgencyRole = ["AGENCY_ADMIN", "AGENCY_USER"].includes(actor.role);
  const scopeOk =
    (t.scope === "STAFF" && isStaffWorkflow) ||
    (t.scope === "AGENCY" && isAgencyRole) ||
    t.scope === "BOTH";
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
  });

  await recordAudit({
    actor,
    action: "STATUS_CHANGED",
    entity: "application",
    entityId: app.id,
    agencyId: app.agencyId,
    metadata: { from: from.code, to: to.code, reason: params.reason ?? null },
    ipAddress: params.ipAddress ?? null,
  });

  const aIds = agencyUserIds(app.agencyId);
  await notifyUsersBestEffort(aIds, {
    type: to.code === "COMPLETED" ? "APPLICATION_COMPLETED" : "STATUS_CHANGED",
    title: `Application ${app.reference}: ${to.name}`,
    body: params.reason?.trim()
      ? `Status changed from ${from.name} to ${to.name}. Note: ${params.reason.trim()}`
      : `Status changed from ${from.name} to ${to.name}.`,
    link: `/portal/applications/${app.id}`,
    agencyId: app.agencyId,
    applicationId: app.id,
  }, {
    actorRole: actor.role,
    tenantRef: pseudonymizeIdentifier(app.agencyId),
    resourceType: "application",
    resourceRef: pseudonymizeIdentifier(app.id),
  });
  if (to.code === "DOCUMENTS_REQUESTED") {
    await notifyUsersBestEffort(aIds, {
      type: "DOCUMENTS_REQUIRED",
      title: `Documents required for ${app.reference}`,
      body: "ESSAFARIA requested additional documents. Check the checklist and upload them.",
      link: `/portal/applications/${app.id}`,
      agencyId: app.agencyId,
      applicationId: app.id,
    }, {
      actorRole: actor.role,
      tenantRef: pseudonymizeIdentifier(app.agencyId),
      resourceType: "application",
      resourceRef: pseudonymizeIdentifier(app.id),
    });
  }
  if (isAgencyRole) {
    const sIds = staffUserIds();
    await notifyUsersBestEffort(sIds, {
      type: "STATUS_CHANGED",
      title: `Application ${app.reference}: ${to.name}`,
      body: `${row.agencyName ?? "The agency"} changed the status from ${from.name} to ${to.name}.`,
      link: `/admin/applications/${app.id}`,
      agencyId: app.agencyId,
      applicationId: app.id,
    }, {
      actorRole: actor.role,
      tenantRef: pseudonymizeIdentifier(app.agencyId),
      resourceType: "application",
      resourceRef: pseudonymizeIdentifier(app.id),
    });
  }

  logEvent({
    eventName: "application.status_transition.succeeded",
    result: "succeeded",
    actorRole: actor.role,
    tenantRef: pseudonymizeIdentifier(app.agencyId),
    resourceType: "application",
    resourceRef: pseudonymizeIdentifier(app.id),
    metadata: { from: from.code, to: to.code },
    durationMs: Date.now() - transitionStartedAt,
  });

  return { from: from.code, to: to.code };
}

/* ------------------------------------------------------------------ */
/* Final decisions (PHASE 2.1)                                         */
/* ------------------------------------------------------------------ */

export type DecisionOutcome = "APPROVED" | "REJECTED";

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

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
export function recordApplicationDecision(params: DecisionInput & { file: NonNullable<DecisionInput["file"]> }): Promise<{ documentId: string; statusCode: string }>;
export function recordApplicationDecision(params: DecisionInput): Promise<{ documentId: string | null; statusCode: string }>;
export async function recordApplicationDecision(params: DecisionInput): Promise<{ documentId: string | null; statusCode: string }> {
  const decisionStartedAt = Date.now();
  const { actor, file: f } = params;
  if (!["SUPER_ADMIN", "ADMIN", "VISA_AGENT"].includes(actor.role) || actor.agencyId) {
    throw new AppError("FORBIDDEN", "Only ESSAFARIA staff can record application decisions.");
  }
  if (!["APPROVED", "REJECTED"].includes(params.outcome)) throw new AppError("VALIDATION", "Choose a final decision.");
  if (!f) {
    logEvent({
      eventName: "application.decision.blocked_missing_document",
      severity: "warning",
      classification: "SAFE_PREVENTION",
      result: "prevented",
      errorCode: "DECISION_DOCUMENT_REQUIRED",
      actorRole: actor.role,
      tenantRef: pseudonymizeIdentifier(actor.agencyId),
      resourceType: "application",
      resourceRef: pseudonymizeIdentifier(params.applicationId),
      metadata: { outcome: params.outcome },
      durationMs: Date.now() - decisionStartedAt,
    });
    throw new AppError("DECISION_DOCUMENT_REQUIRED", "Upload the official decision document before recording the final decision.");
  }
  const note = params.note?.trim() || null;
  if (note && note.length > 4000) throw new AppError("VALIDATION", "The note is too long.");
  if (f) {
    if (f.size <= 0 || !f.data.length) throw new AppError("NO_FILE", "The uploaded file is empty.");
    if (f.size > MAX_UPLOAD_BYTES || f.data.length > MAX_UPLOAD_BYTES) throw new AppError("UPLOAD_TOO_LARGE", "Files must be 2 MB or smaller.");
    const valid = (f.type === "application/pdf" && f.data.subarray(0, 4).toString("latin1") === "%PDF")
      || (f.type === "image/jpeg" && f.data.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])))
      || (f.type === "image/png" && f.data.subarray(0, 8).equals(PNG_MAGIC));
    if (!valid) throw new AppError("UPLOAD_TYPE", "Only matching PDF, JPG or PNG decision documents are accepted.");
  }
  const app = (await getApplicationForUser(params.applicationId, actor)).app;
  const documentId = f ? crypto.randomUUID() : null;
  const storageKey = documentId ? buildStorageKey(app.id, documentId) : null;
  if (f && storageKey) await storageProvider().put(storageKey, f.data, f.type);
  try {
    const result = await db.transaction(async (tx) => {
      const [locked] = await tx.select().from(applications).where(eq(applications.id, app.id)).for("update");
      const [from] = await tx.select().from(statuses).where(eq(statuses.id, locked!.statusId));
      const [to] = await tx.select().from(statuses).where(and(eq(statuses.code, params.outcome), eq(statuses.active, true)));
      if (!from || !to) throw new AppError("CONFIG_ERROR", "Decision workflow is not configured.");
      if (!(DECISION_SOURCES[from.code] ?? []).includes(params.outcome)) {
        throw new AppError("BAD_STATE", "The application must be in Processing or at the Embassy and must not already be decided.");
      }
      const [transition] = await tx.select().from(statusTransitions).where(and(
        eq(statusTransitions.fromStatusId, from.id), eq(statusTransitions.toStatusId, to.id),
      ));
      if (!transition || !["STAFF", "BOTH"].includes(transition.scope)) throw new AppError("BAD_STATE", "This decision is not allowed by the configured workflow.");
      const now = new Date();
      if (f && documentId && storageKey) {
        const [dt] = await tx.select().from(documentTypes).where(and(eq(documentTypes.code, documentTypeForOutcome(params.outcome)), eq(documentTypes.active, true)));
        if (!dt) throw new AppError("CONFIG_ERROR", "Decision document type is not available.");
        await tx.insert(documents).values({ id: documentId, applicationId: app.id, documentTypeId: dt.id,
          originalFilename: f.name, mimeType: f.type, sizeBytes: f.data.length, storageKey, status: "ACCEPTED",
          uploadedBy: actor.id, version: 1, reviewedBy: actor.id, reviewedAt: now,
          reviewNotes: "Official decision document",
        });
      }
      await tx.update(applications).set({ statusId: to.id, decisionAt: now, updatedAt: now }).where(eq(applications.id, app.id));
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
    logEvent({
      eventName: "application.decision.succeeded",
      result: "succeeded",
      actorRole: actor.role,
      tenantRef: pseudonymizeIdentifier(app.agencyId),
      resourceType: "application",
      resourceRef: pseudonymizeIdentifier(app.id),
      metadata: { outcome: params.outcome },
      durationMs: Date.now() - decisionStartedAt,
    });
    return result;
  } catch (error) {
    if (storageKey) await storageProvider().delete(storageKey).catch(() => {});
    if (error instanceof AppError && ["BAD_STATE", "FORBIDDEN", "VALIDATION"].includes(error.code)) {
      logEvent({
        eventName: "application.decision.prevented",
        severity: "warning",
        classification: "SAFE_PREVENTION",
        result: "prevented",
        errorCode: error.code,
        actorRole: actor.role,
        tenantRef: pseudonymizeIdentifier(app.agencyId),
        resourceType: "application",
        resourceRef: pseudonymizeIdentifier(app.id),
        metadata: { outcome: params.outcome },
        durationMs: Date.now() - decisionStartedAt,
      });
    } else {
      logErrorOnce("application.decision.technical_failed", error, {
        severity: "error",
        classification: "BUSINESS_FAILURE",
        result: "technical_failed",
        actorRole: actor.role,
        tenantRef: pseudonymizeIdentifier(app.agencyId),
        resourceType: "application",
        resourceRef: pseudonymizeIdentifier(app.id),
        metadata: { outcome: params.outcome },
        durationMs: Date.now() - decisionStartedAt,
      });
    }
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
  const rows = await db
    .select({ status: statuses, scope: statusTransitions.scope })
    .from(statusTransitions)
    .innerJoin(statuses, eq(statusTransitions.toStatusId, statuses.id))
    .where(and(eq(statusTransitions.fromStatusId, fromStatusId), eq(statuses.active, true)))
    .orderBy(asc(statuses.sortOrder));
  const isStaffWorkflow = ["SUPER_ADMIN", "ADMIN", "VISA_AGENT"].includes(role);
  const isAgencyRole = ["AGENCY_ADMIN", "AGENCY_USER"].includes(role);
  return rows.filter((r) =>
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
