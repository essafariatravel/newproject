"use server";

/**
 * Application lifecycle actions — used by both the agency portal and the
 * Back Office. Authorization and tenant checks happen inside each action.
 */
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { applicants, applications, priorities, statuses, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { AppError, type AuthUser } from "@/lib/types";
import {
  changeApplicationStatus,
  createDraftApplication,
  getStatusHistory,
  getSubmissionGate,
  recordApplicationDecision,
  submitApplication,
  type DecisionOutcome,
} from "@/lib/applications";
import { runAction } from "@/lib/action-helpers";
import { recordAudit } from "@/lib/audit";
import { notifyUsers } from "@/lib/notifications";

const idSchema = z.string().uuid("Invalid identifier.");

/**
 * Dossiers in a terminal state never participate in bulk changes: an outcome
 * (approved / rejected) and a cancellation are business events, not batch edits.
 */
const FINAL_STATUS_CODES = new Set(["APPROVED", "REJECTED", "CANCELLED"]);

function clientIp(headers: Headers): string | null {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

async function headersOf(): Promise<Headers> {
  const { headers } = await import("next/headers");
  return headers();
}

/* ------------------------------ create draft ---------------------------- */

export async function createApplicationAction(formData: FormData): Promise<void> {
  await runAction("/portal/applications", async () => {
    const user = await requireUser();
    requirePermission(user, "applications.create");
    if (!user.agencyId) throw new AppError("FORBIDDEN", "Only agency users can create applications.");
    const data = z
      .object({
        visaTypeId: idSchema,
        priorityCode: z.string().trim().max(40).optional(),
        agencyNotes: z.string().trim().max(2000).optional().nullable(),
      })
      .parse({
        visaTypeId: formData.get("visaTypeId"),
        priorityCode: formData.get("priorityCode") || undefined,
        agencyNotes: formData.get("agencyNotes") || null,
      });
    const app = await createDraftApplication({
      agencyId: user.agencyId,
      visaTypeId: data.visaTypeId,
      priorityCode: data.priorityCode ?? null,
      agencyNotes: data.agencyNotes ?? null,
      createdBy: user,
      ipAddress: clientIp(await headersOf()),
    });
    await recordAudit({ actor: user, action: "APPLICATION_CREATED", entity: "application", entityId: app.id, agencyId: user.agencyId, metadata: { reference: app.reference } });
    revalidatePath("/portal/applications");
    return `Draft ${app.reference} created. Continue on the application page.`;
  });
}

/* ------------------------------- applicants ----------------------------- */

const applicantSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required.").max(80),
  middleName: z.string().trim().max(80).optional().nullable(),
  lastName: z.string().trim().min(1, "Last name is required.").max(80),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use format YYYY-MM-DD."),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional().or(z.literal("")).transform((v) => (v === "" ? null : v)),
  nationality: z.string().trim().min(2, "Nationality is required.").max(80),
  passportNumber: z
    .string()
    .trim()
    .min(4, "Passport number is required.")
    .max(40)
    .regex(/^[A-Za-z0-9]+$/, "Passport number may only contain letters and digits.")
    .transform((v) => v.toUpperCase()),
  passportIssueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")).transform((v) => (v === "" ? null : v)),
  passportExpiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Passport expiry is required."),
  email: z.string().trim().email().optional().or(z.literal("")).transform((v) => (v === "" ? null : v)),
  phone: z.string().trim().max(40).optional().nullable(),
  addressLine: z.string().trim().max(300).optional().nullable(),
  city: z.string().trim().max(80).optional().nullable(),
  country: z.string().trim().max(80).optional().nullable(),
}).refine((d) => !d.passportIssueDate || d.passportIssueDate < d.passportExpiryDate, {
  message: "Passport issue date must be before expiry date.",
  path: ["passportIssueDate"],
});

/** Assert the agency user owns this application (staff bypass). */
async function assertOwnApplication(applicationId: string, user: AuthUser) {
  const rows = await db
    .select({ id: applications.id, agencyId: applications.agencyId })
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);
  const app = rows[0];
  if (!app) throw new AppError("NOT_FOUND", "Application not found.");
  if (user.agencyId && app.agencyId !== user.agencyId) {
    throw new AppError("NOT_FOUND", "Application not found.");
  }
  return app;
}

export async function addApplicantAction(formData: FormData): Promise<void> {
  const applicationId = idSchema.parse(formData.get("applicationId"));
  const back = String(formData.get("back") ?? `/portal/applications/${applicationId}`);
  await runAction(back, async () => {
    const user = await requireUser();
    const app = await assertOwnApplication(applicationId, user);
    const data = applicantSchema.parse(Object.fromEntries(formData));
    const dob = new Date(data.dateOfBirth);
    const expiry = new Date(data.passportExpiryDate);
    if (Number.isNaN(dob.getTime()) || dob > new Date()) throw new AppError("VALIDATION", "Date of birth must be in the past.");
    if (expiry < new Date()) throw new AppError("VALIDATION", "Passport is already expired; renew before applying.");
    const inserted = await db
      .insert(applicants)
      .values({ applicationId: app.id, ...data })
      .returning();
    await recordAudit({
      actor: user,
      action: "APPLICANT_ADDED",
      entity: "applicant",
      entityId: inserted[0]!.id,
      agencyId: app.agencyId,
      metadata: { applicationId: app.id, passport: data.passportNumber },
    });
    revalidatePath(back);
    return `Applicant ${data.firstName} ${data.lastName} added.`;
  });
}

export async function updateApplicantAction(formData: FormData): Promise<void> {
  const applicantId = idSchema.parse(formData.get("applicantId"));
  const applicationId = idSchema.parse(formData.get("applicationId"));
  const back = String(formData.get("back") ?? `/portal/applications/${applicationId}`);
  await runAction(back, async () => {
    const user = await requireUser();
    const app = await assertOwnApplication(applicationId, user);
    const rows = await db
      .select({ id: applicants.id })
      .from(applicants)
      .where(and(eq(applicants.id, applicantId), eq(applicants.applicationId, app.id)))
      .limit(1);
    if (!rows[0]) throw new AppError("NOT_FOUND", "Applicant not found.");
    const data = applicantSchema.parse(Object.fromEntries(formData));
    await db.update(applicants).set({ ...data, updatedAt: new Date() }).where(eq(applicants.id, applicantId));
    await recordAudit({
      actor: user,
      action: "APPLICANT_UPDATED",
      entity: "applicant",
      entityId: applicantId,
      agencyId: app.agencyId,
      metadata: { applicationId: app.id },
    });
    revalidatePath(back);
    return "Applicant saved.";
  });
}

export async function removeApplicantAction(formData: FormData): Promise<void> {
  const applicantId = idSchema.parse(formData.get("applicantId"));
  const applicationId = idSchema.parse(formData.get("applicationId"));
  const back = String(formData.get("back") ?? `/portal/applications/${applicationId}`);
  await runAction(back, async () => {
    const user = await requireUser();
    const app = await assertOwnApplication(applicationId, user);
    const removed = await db
      .delete(applicants)
      .where(and(eq(applicants.id, applicantId), eq(applicants.applicationId, app.id)))
      .returning();
    if (!removed[0]) throw new AppError("NOT_FOUND", "Applicant not found.");
    await recordAudit({
      actor: user,
      action: "APPLICANT_REMOVED",
      entity: "applicant",
      entityId: applicantId,
      agencyId: app.agencyId,
      metadata: { applicationId: app.id },
    });
    revalidatePath(back);
    return "Applicant removed.";
  });
}

/* -------------------------------- submit -------------------------------- */

export async function submitApplicationAction(formData: FormData): Promise<void> {
  const applicationId = idSchema.parse(formData.get("applicationId"));
  const back = String(formData.get("back") ?? `/portal/applications/${applicationId}`);
  await runAction(back, async () => {
    const user = await requireUser();
    const result = await submitApplication({
      applicationId,
      actor: user,
      overrideReason: formData.get("overrideReason") ? String(formData.get("overrideReason")) : null,
      ipAddress: clientIp(await headersOf()),
    });
    revalidatePath(back);
    revalidatePath("/portal");
    revalidatePath("/portal/wallet");
    revalidatePath("/admin");
    return `Application ${result.reference} submitted. Wallet charged — new balance ${result.charge.balanceAfter}.`;
  });
}

export async function cancelDraftAction(formData: FormData): Promise<void> {
  const applicationId = idSchema.parse(formData.get("applicationId"));
  const back = String(formData.get("back") ?? `/portal/applications/${applicationId}`);
  await runAction(back, async () => {
    const user = await requireUser();
    await changeApplicationStatus({
      applicationId,
      toStatusCode: "CANCELLED",
      reason: String(formData.get("reason") ?? "") || null,
      actor: user,
      ipAddress: clientIp(await headersOf()),
    });
    revalidatePath(back);
    revalidatePath("/portal/applications");
    return "Application cancelled.";
  });
}

/* ---------------------------- status & assign --------------------------- */

export async function changeStatusAction(formData: FormData): Promise<void> {
  const applicationId = idSchema.parse(formData.get("applicationId"));
  const back = String(formData.get("back") ?? `/admin/applications/${applicationId}`);
  await runAction(back, async () => {
    const user = await requireUser();
    const data = z
      .object({
        toStatusCode: z.string().trim().min(2).max(60),
        reason: z.string().trim().max(1000).optional(),
      })
      .parse({
        toStatusCode: formData.get("toStatusCode"),
        reason: formData.get("reason") || undefined,
      });
    const result = await changeApplicationStatus({
      applicationId,
      toStatusCode: data.toStatusCode,
      reason: data.reason ?? null,
      actor: user,
      ipAddress: clientIp(await headersOf()),
    });
    revalidatePath(back);
    revalidatePath("/admin");
    revalidatePath(`/portal/applications/${applicationId}`);
    return `Status changed ${result.from} → ${result.to}.`;
  });
}

/* ------------------------ final decision (staff) ------------------------ */

export async function recordDecisionAction(formData: FormData): Promise<void> {
  const applicationId = idSchema.parse(formData.get("applicationId"));
  const back = String(formData.get("back") ?? `/admin/applications/${applicationId}`);
  await runAction(back, async () => {
    const user = await requireUser();
    const outcomeRaw = String(formData.get("outcome") ?? "");
    if (!["APPROVED", "REJECTED"].includes(outcomeRaw)) {
      throw new AppError("VALIDATION", "Choose a decision outcome (Approved / Rejected).");
    }
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      throw new AppError("NO_FILE", "Upload the decision document (visa copy or refusal letter) before recording the decision.");
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const result = await recordApplicationDecision({
      applicationId,
      outcome: outcomeRaw as DecisionOutcome,
      actor: user,
      file: { name: file.name || "decision.pdf", type: file.type || "application/octet-stream", size: file.size, data: buf },
      ipAddress: clientIp(await headersOf()),
    });
    revalidatePath(back);
    revalidatePath("/admin");
    revalidatePath(`/portal/applications/${applicationId}`);
    revalidatePath("/admin/documents");
    revalidatePath("/portal/documents");
    return `Decision recorded (${result.statusCode}) — document accepted and visible to the agency.`;
  });
}

export async function assignOfficerAction(formData: FormData): Promise<void> {
  const applicationId = idSchema.parse(formData.get("applicationId"));
  const back = String(formData.get("back") ?? `/admin/applications/${applicationId}`);
  await runAction(back, async () => {
    const user = await requireUser();
    requirePermission(user, "applications.assign");
    const assignedToRaw = formData.get("assignedTo");
    const assignedTo = assignedToRaw && assignedToRaw !== "" ? idSchema.parse(assignedToRaw) : null;
    await db
      .update(applications)
      .set({ assignedTo, updatedAt: new Date() })
      .where(eq(applications.id, applicationId));
    await recordAudit({
      actor: user,
      action: "APPLICATION_ASSIGNED",
      entity: "application",
      entityId: applicationId,
      metadata: { assignedTo },
    });
    // §25 — the new case officer is told, with a deep link to the dossier.
    if (assignedTo && assignedTo !== user.id) {
      const app = (
        await db
          .select({ reference: applications.reference, agencyId: applications.agencyId })
          .from(applications)
          .where(eq(applications.id, applicationId))
          .limit(1)
      )[0];
      if (app) {
        await notifyUsers([assignedTo], {
          type: "APPLICATION_ASSIGNED",
          title: `Assigned: ${app.reference}`,
          body: `${user.name} assigned this dossier to you.`,
          link: `/admin/applications/${applicationId}`,
          agencyId: app.agencyId,
          applicationId,
        });
      }
    }
    revalidatePath(back);
    return assignedTo ? "Case officer assigned." : "Assignment cleared.";
  });
}

/* ------------------------------ safe bulk ------------------------------- */
/**
 * §"safe bulk actions (assign / priority / export)".
 *
 * Deliberately narrow: the ONLY bulk operations are assignment and priority.
 * There is no bulk approve, reject, wallet debit or delete anywhere in the
 * product (§decision integrity — every outcome stays an explicit, single-dossier
 * staff action). Rows that are already finished (REJECTED / CANCELLED / APPROVED
 * handled by the same guard) are skipped rather than silently mutated, the count
 * is reported back, and every touched dossier gets its own audit entry.
 */
const BULK_LIMIT = 200;

async function parseBulkIds(formData: FormData) {
  const raw = formData.getAll("ids").map(String).filter((v) => v.trim() !== "");
  if (raw.length === 0) throw new AppError("VALIDATION", "Select at least one dossier first.");
  if (raw.length > BULK_LIMIT) throw new AppError("VALIDATION", `Select at most ${BULK_LIMIT} dossiers at a time.`);
  const ids = raw.map((v) => idSchema.parse(v));
  // Tenant/RBAC safe by construction: staff-only, and only ids that really exist.
  const rows = await db
    .select({ id: applications.id, reference: applications.reference, statusCode: statuses.code, agencyId: applications.agencyId })
    .from(applications)
    .innerJoin(statuses, eq(applications.statusId, statuses.id))
    .where(inArray(applications.id, ids));
  if (rows.length !== ids.length) throw new AppError("NOT_FOUND", "One of the selected dossiers no longer exists.");
  if (rows.some((r) => FINAL_STATUS_CODES.has(r.statusCode))) {
    throw new AppError(
      "VALIDATION",
      "Finished dossiers (approved / rejected / cancelled) are excluded from bulk changes — open them individually if a correction is needed.",
    );
  }
  return rows;
}

export async function bulkAssignAction(formData: FormData): Promise<void> {
  await runAction("/admin/applications", async () => {
    const user = await requireUser();
    requirePermission(user, "applications.assign");
    const rows = await parseBulkIds(formData);
    const assignedToRaw = formData.get("assignedTo");
    const assignedTo = assignedToRaw && String(assignedToRaw) !== "" ? idSchema.parse(assignedToRaw) : null;
    if (assignedTo) {
      const officer = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, assignedTo)).limit(1);
      if (!officer[0] || officer[0].role === "AGENCY_ADMIN" || officer[0].role === "AGENCY_USER") {
        throw new AppError("VALIDATION", "Dossiers can only be assigned to ESSAFARIA staff.");
      }
    }
    for (const row of rows) {
      await db.update(applications).set({ assignedTo, updatedAt: new Date() }).where(eq(applications.id, row.id));
      await recordAudit({
        actor: user,
        action: "APPLICATION_ASSIGNED",
        entity: "application",
        entityId: row.id,
        agencyId: row.agencyId,
        metadata: { assignedTo, bulk: true },
      });
      if (assignedTo && assignedTo !== user.id) {
        await notifyUsers([assignedTo], {
          type: "APPLICATION_ASSIGNED",
          title: `Assigned: ${row.reference}`,
          body: `${user.name} assigned this dossier to you.`,
          link: `/admin/applications/${row.id}`,
          agencyId: row.agencyId,
          applicationId: row.id,
        });
      }
    }
    revalidatePath("/admin/applications");
    return assignedTo
      ? `${rows.length} dossier(s) assigned to the selected officer.`
      : `Assignment cleared on ${rows.length} dossier(s).`;
  });
}

export async function bulkPriorityAction(formData: FormData): Promise<void> {
  await runAction("/admin/applications", async () => {
    const user = await requireUser();
    requirePermission(user, "applications.review");
    const rows = await parseBulkIds(formData);
    const priorityId = idSchema.parse(formData.get("priorityId"));
    const priority = await db.select({ id: priorities.id, name: priorities.name }).from(priorities).where(eq(priorities.id, priorityId)).limit(1);
    if (!priority[0]) throw new AppError("VALIDATION", "Choose a valid priority.");
    for (const row of rows) {
      await db.update(applications).set({ priorityId, updatedAt: new Date() }).where(eq(applications.id, row.id));
      await recordAudit({
        actor: user,
        action: "APPLICATION_PRIORITY_CHANGED",
        entity: "application",
        entityId: row.id,
        agencyId: row.agencyId,
        metadata: { priorityId, priorityName: priority[0].name, bulk: true },
      });
    }
    revalidatePath("/admin/applications");
    return `Priority "${priority[0].name}" applied to ${rows.length} dossier(s).`;
  });
}

export async function updateInternalNotesAction(formData: FormData): Promise<void> {
  const applicationId = idSchema.parse(formData.get("applicationId"));
  const back = String(formData.get("back") ?? `/admin/applications/${applicationId}`);
  await runAction(back, async () => {
    const user = await requireUser();
    requirePermission(user, "applications.review");
    const notes = z.string().trim().max(5000).parse(formData.get("internalNotes") ?? "");
    await db.update(applications).set({ internalNotes: notes, updatedAt: new Date() }).where(eq(applications.id, applicationId));
    await recordAudit({ actor: user, action: "APPLICATION_NOTES_UPDATED", entity: "application", entityId: applicationId });
    revalidatePath(back);
    return "Internal notes saved.";
  });
}

/* ------------------------------ gate preview ---------------------------- */

export async function submissionGateFor(applicationId: string) {
  return getSubmissionGate(applicationId);
}

export async function historyFor(applicationId: string) {
  return getStatusHistory(applicationId);
}

/* -------------------- atomic 3-step request (Phase 2.3) -------------------- */

/**
 * Final step of the new portal wizard: ONE FormData carrying traveller rows,
 * notes, and the document files. Everything is validated and committed in a
 * single server transaction in `submitVisaRequest` — no draft state exists.
 * On any enumerated validation failure the user returns to the wizard with a
 * stable, localizable error code strap (`?error=<code>`).
 */
function lastTextField(fd: FormData, key: string): string {
  const vals = fd.getAll(key).filter((x): x is string => typeof x === "string" && x.trim() !== "");
  return vals.length > 0 ? vals[vals.length - 1]!.trim() : "";
}

export async function submitRequestAction(formData: FormData): Promise<void> {
  const { requireAgencyUser } = await import("@/lib/auth");
  const user = await requireAgencyUser();
  const ip = clientIp(await headersOf());
  const { submitVisaRequest } = await import("@/lib/requests");
  type RequestTraveller = import("@/lib/requests").RequestTraveller;

  const idempotencyKey = String(formData.get("idempotencyKey") ?? "");
  // The controlled wizard writes countryId through a hidden input (which a
  // plain FormData submit may precede with an empty first entry); take the
  // LAST non-empty value, matching how browsers/RSC clients merge fields.
  const countryId = lastTextField(formData, "countryId");
  const visaTypeId = lastTextField(formData, "visaTypeId");
  const priorityCode = String(formData.get("priorityCode") ?? "") || null;
  const agencyNotes = String(formData.get("agencyNotes") ?? "") || null;

  // Phase 2-Final: ONE applicant — full name + nationality only.
  const travellers: RequestTraveller[] = [];
  const fullName = String(formData.get("t0_fullName") ?? "").trim();
  const nationality = String(formData.get("t0_nationality") ?? "").trim();
  if (fullName || nationality) {
    travellers.push({ fullName, nationality });
  }

  // Files: every entry named file_<documentTypeId> (multiple allowed).
  const documents: { documentTypeId: string; file: { name: string; type: string; size: number; data: Buffer } }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("file_") || typeof value === "string") continue;
    const documentTypeId = key.slice(5);
    if (!/^[0-9a-f-]{36}$/i.test(documentTypeId)) continue;
    if (value.size === 0 && !value.name) continue; // untouched picker
    documents.push({
      documentTypeId,
      file: { name: value.name, type: value.type, size: value.size, data: Buffer.from(await value.arrayBuffer()) },
    });
  }

  const { redirect } = await import("next/navigation");
  let applicationId = "";
  try {
    const result = await submitVisaRequest({
      actor: user,
      idempotencyKey,
      countryId,
      visaTypeId,
      priorityCode,
      agencyNotes,
      travellers,
      documents,
      ipAddress: ip,
    });
    applicationId = result.applicationId;
  } catch (error) {
    if (error instanceof AppError) {
      redirect(`/portal/applications/new?error=${encodeURIComponent(error.code)}`);
    }
    console.error("submit-request-failed", error);
    redirect("/portal/applications/new?error=INTERNAL");
  }

  revalidatePath("/portal/applications");
  redirect(`/portal/applications/${applicationId}?submitted=1`);
}
