"use server";

/**
 * Application lifecycle actions — used by both the agency portal and the
 * Back Office. Authorization and tenant checks happen inside each action.
 */
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { applicants, applications } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { AppError, type AuthUser } from "@/lib/types";
import {
  changeApplicationStatus,
  createDraftApplication,
  getStatusHistory,
  getSubmissionGate,
  submitApplication,
} from "@/lib/applications";
import { runAction } from "@/lib/action-helpers";
import { recordAudit } from "@/lib/audit";

const idSchema = z.string().uuid("Invalid identifier.");

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
    revalidatePath(back);
    return assignedTo ? "Case officer assigned." : "Assignment cleared.";
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
