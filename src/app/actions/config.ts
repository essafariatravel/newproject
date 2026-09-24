"use server";

/**
 * Configuration management actions (ESSAFARIA staff only).
 * Every mutation is validated, permission-checked and audited.
 */
import { and, eq, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  applicationStatusHistory,
  applications,
  countries,
  currencies,
  documentTypes,
  priorities,
  statusTransitions,
  statuses,
  visaCategories,
  visaRequirements,
  visaTypes,
} from "@/db/schema";
import { requireStaff } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { AppError } from "@/lib/types";
import { draftApplicationIdsForVisaType, resyncChecklist } from "@/lib/applications";
import { runAction } from "@/lib/action-helpers";

const idSchema = z.string().uuid("Invalid identifier.");
const codeSchema = z
  .string()
  .trim()
  .min(2, "Code must be at least 2 characters.")
  .max(40)
  .regex(/^[A-Z0-9_-]+$/i, "Code may only contain letters, numbers, dashes and underscores.")
  .transform((v) => v.toUpperCase());

/* ------------------------------ countries ------------------------------ */

const countrySchema = z.object({
  name: z.string().trim().min(2, "Country name is required.").max(80),
  iso2: z
    .string()
    .trim()
    .length(2, "ISO code must be exactly 2 letters.")
    .regex(/^[A-Za-z]{2}$/)
    .transform((v) => v.toUpperCase()),
  region: z.string().trim().max(60).optional().nullable(),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});

export async function createCountryAction(formData: FormData): Promise<void> {
  await runAction("/admin/config/countries", async () => {
    const staff = await requireStaff();
    requirePermission(staff, "config.manage");
    const data = countrySchema.parse(Object.fromEntries(formData));
    const existing = await db.select({ id: countries.id }).from(countries).where(eq(countries.iso2, data.iso2)).limit(1);
    if (existing[0]) throw new AppError("DUPLICATE", `A country with ISO code ${data.iso2} already exists.`);
    const inserted = await db.insert(countries).values(data).returning();
    await recordAudit({ actor: staff, action: "CONFIG_COUNTRY_CREATED", entity: "country", entityId: inserted[0]!.id, metadata: data });
    revalidatePath("/admin/config/countries");
    revalidatePath("/countries");
    return `Country "${data.name}" created.`;
  });
}

export async function updateCountryAction(formData: FormData): Promise<void> {
  await runAction("/admin/config/countries", async () => {
    const staff = await requireStaff();
    requirePermission(staff, "config.manage");
    const id = idSchema.parse(formData.get("id"));
    const toggle = formData.get("toggle");
    if (toggle) {
      await db.update(countries).set({ active: sql`not ${countries.active}`, updatedAt: new Date() }).where(eq(countries.id, id));
      await recordAudit({ actor: staff, action: "CONFIG_COUNTRY_TOGGLED", entity: "country", entityId: id });
    } else {
      const data = countrySchema.parse(Object.fromEntries(formData));
      await db.update(countries).set({ ...data, updatedAt: new Date() }).where(eq(countries.id, id));
      await recordAudit({ actor: staff, action: "CONFIG_COUNTRY_UPDATED", entity: "country", entityId: id, metadata: data });
    }
    revalidatePath("/admin/config/countries");
    revalidatePath("/countries");
    return "Country saved.";
  });
}

export async function deleteCountryAction(formData: FormData): Promise<void> {
  await runAction("/admin/config/countries", async () => {
    const staff = await requireStaff();
    requirePermission(staff, "config.manage");
    const id = idSchema.parse(formData.get("id"));
    const rows = await db.select().from(countries).where(eq(countries.id, id)).limit(1);
    const country = rows[0];
    if (!country) throw new AppError("NOT_FOUND", "Country not found.");

    // Safe hard-delete: block if referenced by visa_types or applications
    const vtRef = await db.select({ id: visaTypes.id }).from(visaTypes).where(eq(visaTypes.countryId, id)).limit(1);
    if (vtRef.length > 0) {
      throw new AppError("REFERENCED", `Cannot delete ${country.name}: it is referenced by ${vtRef.length > 0 ? "visa types" : ""}. Deactivate it instead.`);
    }
    const appRef = await db.select({ id: applications.id }).from(applications).where(eq(applications.countryId, id)).limit(1);
    if (appRef.length > 0) {
      throw new AppError("REFERENCED", `Cannot delete ${country.name}: it has historical applications. Deactivate it instead.`);
    }

    await db.delete(countries).where(eq(countries.id, id));
    await recordAudit({ actor: staff, action: "CONFIG_COUNTRY_DELETED", entity: "country", entityId: id, metadata: { name: country.name, mode: "hard" } });
    revalidatePath("/admin/config/countries");
    return `Country "${country.name}" deleted.`;
  });
}

/* --------------------------- visa categories --------------------------- */

const categorySchema = z.object({
  name: z.string().trim().min(2).max(60),
  code: codeSchema,
  description: z.string().trim().max(500).optional().nullable(),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});

export async function createVisaCategoryAction(formData: FormData): Promise<void> {
  await runAction("/admin/config/visa-categories", async () => {
    const staff = await requireStaff();
    requirePermission(staff, "config.manage");
    const data = categorySchema.parse(Object.fromEntries(formData));
    const inserted = await db.insert(visaCategories).values(data).onConflictDoNothing().returning();
    if (!inserted[0]) throw new AppError("DUPLICATE", `Category code ${data.code} already exists.`);
    await recordAudit({ actor: staff, action: "CONFIG_CATEGORY_CREATED", entity: "visa_category", entityId: inserted[0].id, metadata: { code: data.code } });
    revalidatePath("/admin/config/visa-categories");
    return `Category "${data.name}" created.`;
  });
}

export async function updateVisaCategoryAction(formData: FormData): Promise<void> {
  await runAction("/admin/config/visa-categories", async () => {
    const staff = await requireStaff();
    requirePermission(staff, "config.manage");
    const id = idSchema.parse(formData.get("id"));
    if (formData.get("toggle")) {
      await db.update(visaCategories).set({ active: sql`not ${visaCategories.active}`, updatedAt: new Date() }).where(eq(visaCategories.id, id));
      await recordAudit({ actor: staff, action: "CONFIG_CATEGORY_TOGGLED", entity: "visa_category", entityId: id });
    } else {
      const data = categorySchema.parse(Object.fromEntries(formData));
      await db.update(visaCategories).set({ ...data, updatedAt: new Date() }).where(eq(visaCategories.id, id));
      await recordAudit({ actor: staff, action: "CONFIG_CATEGORY_UPDATED", entity: "visa_category", entityId: id });
    }
    revalidatePath("/admin/config/visa-categories");
    return "Category saved.";
  });
}

/* ------------------------------ visa types ----------------------------- */

const visaTypeSchema = z.object({
  countryId: idSchema,
  categoryId: idSchema,
  name: z.string().trim().min(2).max(120),
  code: codeSchema,
  description: z.string().trim().max(1000).optional().nullable(),
  processingMinDays: z.coerce.number().int().min(0).max(365),
  processingMaxDays: z.coerce.number().int().min(0).max(365),
  fee: z.coerce.number().min(0).max(100000),
  // DZD is the ONLY operational currency (§7): never client-controlled.
  // §18/§42 — the embassy step is a programme property, not a global default.
  embassyApplicability: z
    .enum(["NOT_APPLICABLE", "OPTIONAL", "APPLICABLE"])
    .default("OPTIONAL"),
}).refine((d) => d.processingMinDays <= d.processingMaxDays && (d.processingMinDays > 0 || d.processingMaxDays === 0), {
  message: "Enter a valid range, or use zero for both values for an estimate on request.",
  path: ["processingMinDays"],
});

export async function createVisaTypeAction(formData: FormData): Promise<void> {
  await runAction("/admin/config/visa-types", async () => {
    const staff = await requireStaff();
    requirePermission(staff, "config.manage");
    const data = visaTypeSchema.parse(Object.fromEntries(formData));
    const inserted = await db
      .insert(visaTypes)
      .values({ ...data, fee: data.fee.toFixed(2), currency: "DZD" })
      .onConflictDoNothing()
      .returning();
    if (!inserted[0]) throw new AppError("DUPLICATE", `Visa type code ${data.code} already exists.`);
    await recordAudit({ actor: staff, action: "CONFIG_VISA_TYPE_CREATED", entity: "visa_type", entityId: inserted[0].id, metadata: { code: data.code, fee: data.fee } });
    revalidatePath("/admin/config/visa-types");
    revalidatePath("/visas");
    return `Visa type "${data.name}" created.`;
  });
}

export async function updateVisaTypeAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("id"));
  const back = String(formData.get("back") ?? "/admin/config/visa-types");
  await runAction(back, async () => {
    const staff = await requireStaff();
    requirePermission(staff, "config.manage");
    if (formData.get("toggle")) {
      await db.update(visaTypes).set({ active: sql`not ${visaTypes.active}`, updatedAt: new Date() }).where(eq(visaTypes.id, id));
      await recordAudit({ actor: staff, action: "CONFIG_VISA_TYPE_TOGGLED", entity: "visa_type", entityId: id });
    } else {
      const data = visaTypeSchema.parse(Object.fromEntries(formData));
      await db.update(visaTypes).set({ ...data, fee: data.fee.toFixed(2), currency: "DZD", updatedAt: new Date() }).where(eq(visaTypes.id, id));
      await recordAudit({
        actor: staff,
        action: "CONFIG_VISA_TYPE_UPDATED",
        entity: "visa_type",
        entityId: id,
        metadata: { fee: data.fee, embassyApplicability: data.embassyApplicability },
      });
    }
    revalidatePath("/admin/config/visa-types");
    revalidatePath(`/admin/config/visa-types/${id}`);
    revalidatePath("/visas");
    return "Visa type saved. Existing applications keep their original snapshot.";
  });
}

/* ----------------------------- requirements ---------------------------- */

export async function addRequirementAction(formData: FormData): Promise<void> {
  const visaTypeId = idSchema.parse(formData.get("visaTypeId"));
  await runAction(`/admin/config/visa-types/${visaTypeId}`, async () => {
    const staff = await requireStaff();
    requirePermission(staff, "config.manage");
    const documentTypeId = idSchema.parse(formData.get("documentTypeId"));
    const required = formData.get("required") === "on" || formData.get("required") === "true";
    const notes = z.string().trim().max(500).optional().nullable().parse(formData.get("notes") || null);
    const sortOrder = z.coerce.number().int().min(0).max(999).default(0).parse(formData.get("sortOrder") ?? 0);
    const inserted = await db
      .insert(visaRequirements)
      .values({ visaTypeId, documentTypeId, required, notes: notes ?? null, sortOrder })
      .onConflictDoNothing()
      .returning();
    if (!inserted[0]) throw new AppError("DUPLICATE", "This document type is already a requirement for the visa.");
    // Propagate to draft applications of this visa type (additions only).
    const draftIds = await draftApplicationIdsForVisaType(visaTypeId);
    for (const appId of draftIds) await resyncChecklist(appId, visaTypeId);
    await recordAudit({
      actor: staff,
      action: "CONFIG_REQUIREMENT_ADDED",
      entity: "visa_requirement",
      entityId: inserted[0].id,
      metadata: { visaTypeId, documentTypeId, required, draftsResynced: draftIds.length },
    });
    revalidatePath(`/admin/config/visa-types/${visaTypeId}`);
    return "Requirement added. Draft applications were re-synced.";
  });
}

export async function updateRequirementAction(formData: FormData): Promise<void> {
  const visaTypeId = idSchema.parse(formData.get("visaTypeId"));
  await runAction(`/admin/config/visa-types/${visaTypeId}`, async () => {
    const staff = await requireStaff();
    requirePermission(staff, "config.manage");
    const id = idSchema.parse(formData.get("id"));
    const rows = await db.select().from(visaRequirements).where(eq(visaRequirements.id, id)).limit(1);
    const req = rows[0];
    if (!req || req.visaTypeId !== visaTypeId) throw new AppError("NOT_FOUND", "Requirement not found.");
    if (formData.get("toggleActive")) {
      await db.update(visaRequirements).set({ active: !req.active, updatedAt: new Date() }).where(eq(visaRequirements.id, id));
      await recordAudit({ actor: staff, action: "CONFIG_REQUIREMENT_TOGGLED", entity: "visa_requirement", entityId: id, metadata: { active: !req.active } });
    } else if (formData.get("toggleRequired")) {
      await db.update(visaRequirements).set({ required: !req.required, updatedAt: new Date() }).where(eq(visaRequirements.id, id));
      await recordAudit({ actor: staff, action: "CONFIG_REQUIREMENT_TOGGLED", entity: "visa_requirement", entityId: id, metadata: { required: !req.required } });
    }
    revalidatePath(`/admin/config/visa-types/${visaTypeId}`);
    return "Requirement updated.";
  });
}

export async function removeRequirementAction(formData: FormData): Promise<void> {
  const visaTypeId = idSchema.parse(formData.get("visaTypeId"));
  await runAction(`/admin/config/visa-types/${visaTypeId}`, async () => {
    const staff = await requireStaff();
    requirePermission(staff, "config.manage");
    const id = idSchema.parse(formData.get("id"));
    const deleted = await db
      .delete(visaRequirements)
      .where(and(eq(visaRequirements.id, id), eq(visaRequirements.visaTypeId, visaTypeId)))
      .returning();
    if (!deleted[0]) throw new AppError("NOT_FOUND", "Requirement not found.");
    await recordAudit({ actor: staff, action: "CONFIG_REQUIREMENT_REMOVED", entity: "visa_requirement", entityId: id, metadata: { visaTypeId } });
    revalidatePath(`/admin/config/visa-types/${visaTypeId}`);
    return "Requirement removed. Existing application checklists are preserved.";
  });
}

/* ---------------------------- document types --------------------------- */

const docTypeSchema = z.object({
  name: z.string().trim().min(2).max(80),
  code: codeSchema,
  description: z.string().trim().max(500).optional().nullable(),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});

export async function createDocumentTypeAction(formData: FormData): Promise<void> {
  await runAction("/admin/config/document-types", async () => {
    const staff = await requireStaff();
    requirePermission(staff, "config.manage");
    const data = docTypeSchema.parse(Object.fromEntries(formData));
    const inserted = await db.insert(documentTypes).values(data).onConflictDoNothing().returning();
    if (!inserted[0]) throw new AppError("DUPLICATE", `Document type code ${data.code} already exists.`);
    await recordAudit({ actor: staff, action: "CONFIG_DOCUMENT_TYPE_CREATED", entity: "document_type", entityId: inserted[0].id });
    revalidatePath("/admin/config/document-types");
    return `Document type "${data.name}" created.`;
  });
}

export async function updateDocumentTypeAction(formData: FormData): Promise<void> {
  await runAction("/admin/config/document-types", async () => {
    const staff = await requireStaff();
    requirePermission(staff, "config.manage");
    const id = idSchema.parse(formData.get("id"));
    if (formData.get("toggle")) {
      await db.update(documentTypes).set({ active: sql`not ${documentTypes.active}`, updatedAt: new Date() }).where(eq(documentTypes.id, id));
      await recordAudit({ actor: staff, action: "CONFIG_DOCUMENT_TYPE_TOGGLED", entity: "document_type", entityId: id });
    } else {
      const data = docTypeSchema.parse(Object.fromEntries(formData));
      await db.update(documentTypes).set({ ...data, updatedAt: new Date() }).where(eq(documentTypes.id, id));
      await recordAudit({ actor: staff, action: "CONFIG_DOCUMENT_TYPE_UPDATED", entity: "document_type", entityId: id });
    }
    revalidatePath("/admin/config/document-types");
    return "Document type saved.";
  });
}

/* ------------------------------ currencies ----------------------------- */

const currencySchema = z.object({
  code: z.string().trim().length(3, "Currency code must be 3 letters.").transform((v) => v.toUpperCase()),
  name: z.string().trim().min(2).max(60),
  symbol: z.string().trim().min(1).max(8),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});

export async function createCurrencyAction(formData: FormData): Promise<void> {
  await runAction("/admin/config/currencies", async () => {
    const staff = await requireStaff();
    requirePermission(staff, "config.manage");
    const data = currencySchema.parse(Object.fromEntries(formData));
    const inserted = await db.insert(currencies).values(data).onConflictDoNothing().returning();
    if (!inserted[0]) throw new AppError("DUPLICATE", `Currency ${data.code} already exists.`);
    await recordAudit({ actor: staff, action: "CONFIG_CURRENCY_CREATED", entity: "currency", entityId: inserted[0].id });
    revalidatePath("/admin/config/currencies");
    return `Currency ${data.code} created.`;
  });
}

export async function updateCurrencyAction(formData: FormData): Promise<void> {
  await runAction("/admin/config/currencies", async () => {
    const staff = await requireStaff();
    requirePermission(staff, "config.manage");
    const id = idSchema.parse(formData.get("id"));
    if (formData.get("toggle")) {
      await db.update(currencies).set({ active: sql`not ${currencies.active}`, updatedAt: new Date() }).where(eq(currencies.id, id));
      await recordAudit({ actor: staff, action: "CONFIG_CURRENCY_TOGGLED", entity: "currency", entityId: id });
    } else {
      const data = currencySchema.parse(Object.fromEntries(formData));
      await db.update(currencies).set({ ...data, updatedAt: new Date() }).where(eq(currencies.id, id));
      await recordAudit({ actor: staff, action: "CONFIG_CURRENCY_UPDATED", entity: "currency", entityId: id });
    }
    revalidatePath("/admin/config/currencies");
    return "Currency saved.";
  });
}

/* ------------------------------- statuses ------------------------------ */

export async function createStatusAction(formData: FormData): Promise<void> {
  await runAction("/admin/config/statuses", async () => {
    const staff = await requireStaff();
    requirePermission(staff, "config.manage");
    const data = z
      .object({
        code: codeSchema,
        name: z.string().trim().min(2).max(60),
        nameFr: z.string().trim().max(80).optional().nullable(),
        nameAr: z.string().trim().max(80).optional().nullable(),
        description: z.string().trim().max(300).optional().nullable(),
        sortOrder: z.coerce.number().int().min(0).max(999).default(0),
        isTerminal: z.boolean().default(false),
        isDraft: z.boolean().default(false),
      })
      .parse({
        code: formData.get("code"),
        name: formData.get("name"),
        nameFr: formData.get("nameFr") || null,
        nameAr: formData.get("nameAr") || null,
        description: formData.get("description") || null,
        sortOrder: formData.get("sortOrder") ?? 0,
        isTerminal: formData.get("isTerminal") === "on",
        isDraft: formData.get("isDraft") === "on",
      });
    const inserted = await db.insert(statuses).values(data).onConflictDoNothing().returning();
    if (!inserted[0]) throw new AppError("DUPLICATE", `Status ${data.code} already exists.`);
    await recordAudit({ actor: staff, action: "CONFIG_STATUS_CREATED", entity: "status", entityId: inserted[0].id, metadata: { code: data.code } });
    revalidatePath("/admin/config/statuses");
    return `Status "${data.name}" created. Configure its transitions below.`;
  });
}

export async function updateStatusAction(formData: FormData): Promise<void> {
  await runAction("/admin/config/statuses", async () => {
    const staff = await requireStaff();
    requirePermission(staff, "config.manage");
    const id = idSchema.parse(formData.get("id"));
    if (formData.get("toggle")) {
      const st = (await db.select().from(statuses).where(eq(statuses.id, id)))[0];
      if (!st) throw new AppError("NOT_FOUND", "Status not found");
      // Q12 — terminal statuses are locked and cannot be deactivated
      if (st.isTerminal && st.active) throw new AppError("FORBIDDEN", "Terminal statuses (APPROVED / REJECTED / CANCELLED) cannot be deactivated.");
      await db.update(statuses).set({ active: sql`not ${statuses.active}`, updatedAt: new Date() }).where(eq(statuses.id, id));
      await recordAudit({ actor: staff, action: "CONFIG_STATUS_TOGGLED", entity: "status", entityId: id });
      revalidatePath("/admin/config/statuses");
      return "Status toggled.";
    }
    if (formData.get("transitionScope")) {
      const fromStatusId = idSchema.parse(formData.get("fromStatusId"));
      const toStatusId = id;
      const scope = z.enum(["STAFF", "AGENCY", "BOTH"]).parse(formData.get("transitionScope"));
      if (formData.get("remove") === "true") {
        await db.delete(statusTransitions).where(and(eq(statusTransitions.fromStatusId, fromStatusId), eq(statusTransitions.toStatusId, toStatusId)));
        await recordAudit({ actor: staff, action: "CONFIG_TRANSITION_REMOVED", entity: "status_transition", entityId: `${fromStatusId}->${toStatusId}` });
        revalidatePath("/admin/config/statuses");
        return "Transition removed.";
      }
      await db
        .insert(statusTransitions)
        .values({ fromStatusId, toStatusId, scope })
        .onConflictDoUpdate({ target: [statusTransitions.fromStatusId, statusTransitions.toStatusId], set: { scope, updatedAt: new Date() } });
      await recordAudit({ actor: staff, action: "CONFIG_TRANSITION_SAVED", entity: "status_transition", entityId: `${fromStatusId}->${toStatusId}`, metadata: { scope } });
      revalidatePath("/admin/config/statuses");
      return "Transition saved.";
    }
    const data = z
      .object({
        name: z.string().trim().min(2).max(60),
        nameFr: z.string().trim().max(80).optional().nullable(),
        nameAr: z.string().trim().max(80).optional().nullable(),
        description: z.string().trim().max(300).optional().nullable(),
        sortOrder: z.coerce.number().int().min(0).max(999),
      })
      .parse({
        name: formData.get("name"),
        nameFr: formData.get("nameFr") || null,
        nameAr: formData.get("nameAr") || null,
        description: formData.get("description") || null,
        sortOrder: formData.get("sortOrder"),
      });
    await db.update(statuses).set({ ...data, updatedAt: new Date() }).where(eq(statuses.id, id));
    await recordAudit({ actor: staff, action: "CONFIG_STATUS_UPDATED", entity: "status", entityId: id });
    revalidatePath("/admin/config/statuses");
    return "Status saved.";
  });
}

/**
 * Delete a status safely. History preservation is the rule:
 *  - if the status was never referenced by an application or status-history
 *    row → hard delete (its transition edges go with it);
 *  - if anything references it → DEACTIVATE it instead and strip its
 *    transition edges so it can no longer be selected; the row, label and
 *    historical meaning stay intact.
 */
export async function deleteStatusAction(formData: FormData): Promise<void> {
  await runAction("/admin/config/statuses", async () => {
    const staff = await requireStaff();
    requirePermission(staff, "config.manage");
    const id = idSchema.parse(formData.get("id"));
    const rows = await db.select().from(statuses).where(eq(statuses.id, id)).limit(1);
    const status = rows[0];
    if (!status) throw new AppError("NOT_FOUND", "Status not found.");

    const appRef = await db.select({ id: applications.id }).from(applications).where(eq(applications.statusId, id)).limit(1);
    const histRef = await db
      .select({ id: applicationStatusHistory.id })
      .from(applicationStatusHistory)
      .where(or(eq(applicationStatusHistory.fromStatusId, id), eq(applicationStatusHistory.toStatusId, id)))
      .limit(1);
    const referenced = appRef.length > 0 || histRef.length > 0;

    // transition edges are always stripped — an inactive/deleted status must
    // never stay selectable.
    await db
      .delete(statusTransitions)
      .where(or(eq(statusTransitions.fromStatusId, id), eq(statusTransitions.toStatusId, id)));

    if (!referenced) {
      await db.delete(statuses).where(eq(statuses.id, id));
      await recordAudit({ actor: staff, action: "CONFIG_STATUS_DELETED", entity: "status", entityId: id, metadata: { code: status.code, mode: "hard" } });
      revalidatePath("/admin/config/statuses");
      return `Status "${status.name}" deleted (it was never referenced).`;
    }

    await db.update(statuses).set({ active: false, updatedAt: new Date() }).where(eq(statuses.id, id));
    await recordAudit({ actor: staff, action: "CONFIG_STATUS_DELETED", entity: "status", entityId: id, metadata: { code: status.code, mode: "deactivated-referenced" } });
    revalidatePath("/admin/config/statuses");
    return `Status "${status.name}" is referenced by historical records — deactivated instead of deleted so history stays interpretable.`;
  });
}

export async function addTransitionAction(formData: FormData): Promise<void> {
  await runAction("/admin/config/statuses", async () => {
    const staff = await requireStaff();
    requirePermission(staff, "config.manage");
    const fromStatusId = idSchema.parse(formData.get("fromStatusId"));
    const toStatusId = idSchema.parse(formData.get("toStatusId"));
    const scope = z.enum(["STAFF", "AGENCY", "BOTH"]).parse(formData.get("scope") ?? "STAFF");
    if (fromStatusId === toStatusId) throw new AppError("VALIDATION", "A status cannot transition to itself.");
    await db
      .insert(statusTransitions)
      .values({ fromStatusId, toStatusId, scope })
      .onConflictDoNothing();
    await recordAudit({ actor: staff, action: "CONFIG_TRANSITION_ADDED", entity: "status_transition", entityId: `${fromStatusId}->${toStatusId}`, metadata: { scope } });
    revalidatePath("/admin/config/statuses");
    return "Transition added.";
  });
}

/* ------------------------------ priorities ----------------------------- */

export async function createPriorityAction(formData: FormData): Promise<void> {
  await runAction("/admin/config/priorities", async () => {
    const staff = await requireStaff();
    requirePermission(staff, "config.manage");
    const data = z
      .object({
        code: codeSchema,
        name: z.string().trim().min(2).max(40),
        weight: z.coerce.number().int().min(0).max(100),
        sortOrder: z.coerce.number().int().min(0).max(999).default(0),
      })
      .parse(Object.fromEntries(formData));
    const inserted = await db.insert(priorities).values(data).onConflictDoNothing().returning();
    if (!inserted[0]) throw new AppError("DUPLICATE", `Priority ${data.code} already exists.`);
    await recordAudit({ actor: staff, action: "CONFIG_PRIORITY_CREATED", entity: "priority", entityId: inserted[0].id });
    revalidatePath("/admin/config/priorities");
    return `Priority "${data.name}" created.`;
  });
}

export async function updatePriorityAction(formData: FormData): Promise<void> {
  await runAction("/admin/config/priorities", async () => {
    const staff = await requireStaff();
    requirePermission(staff, "config.manage");
    const id = idSchema.parse(formData.get("id"));
    if (formData.get("toggle")) {
      await db.update(priorities).set({ active: sql`not ${priorities.active}`, updatedAt: new Date() }).where(eq(priorities.id, id));
      await recordAudit({ actor: staff, action: "CONFIG_PRIORITY_TOGGLED", entity: "priority", entityId: id });
    } else {
      const data = z
        .object({
          name: z.string().trim().min(2).max(40),
          weight: z.coerce.number().int().min(0).max(100),
          sortOrder: z.coerce.number().int().min(0).max(999),
        })
        .parse(Object.fromEntries(formData));
      await db.update(priorities).set({ ...data, updatedAt: new Date() }).where(eq(priorities.id, id));
      await recordAudit({ actor: staff, action: "CONFIG_PRIORITY_UPDATED", entity: "priority", entityId: id });
    }
    revalidatePath("/admin/config/priorities");
    return "Priority saved.";
  });
}
