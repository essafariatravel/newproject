"use server";

/**
 * Configuration management actions (ESSAFARIA staff only).
 * Every mutation is validated, permission-checked and audited.
 */
import { and, asc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  applicationStatusHistory,
  applications,
  checklistItems,
  countries,
  currencies,
  documentTypes,
  documentRequests,
  documents,
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
import { assertWorkflowCode, assertMutableWorkflowState, assertMutableDocumentType, assertProgrammeRequirementType, assertActiveProgrammeChecklist, assertWorkflowTransition, validateVisaActivation } from "@/lib/configuration-policy";

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
  nameFr: z.string().trim().max(120).optional().nullable(),
  nameAr: z.string().trim().max(120).optional().nullable(),
  iso2: z
    .string()
    .trim()
    .length(2, "ISO code must be exactly 2 letters.")
    .regex(/^[A-Za-z]{2}$/)
    .transform((v) => v.toUpperCase()),
  region: z.enum(["Africa", "Asia", "Europe", "Middle East", "North America", "South America", "Oceania"]).optional().nullable(),
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
  nameFr: z.string().trim().max(120).optional().nullable(),
  nameAr: z.string().trim().max(120).optional().nullable(),
  descriptionFr: z.string().trim().max(1000).optional().nullable(),
  descriptionAr: z.string().trim().max(1000).optional().nullable(),
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
      const existing = (await db.select().from(visaCategories).where(eq(visaCategories.id, id)).limit(1))[0];
      if (!existing) throw new AppError("NOT_FOUND", "Category not found.");
      const data = categorySchema.parse({ ...Object.fromEntries(formData), code: existing.code });
      await db.update(visaCategories).set({ ...data, updatedAt: new Date() }).where(eq(visaCategories.id, id));
      await recordAudit({ actor: staff, action: "CONFIG_CATEGORY_UPDATED", entity: "visa_category", entityId: id });
    }
    revalidatePath("/admin/config/visa-categories");
    return "Category saved.";
  });
}

/* ------------------------------ visa types ----------------------------- */

export async function deleteVisaCategoryAction(formData: FormData): Promise<void> {
  await runAction("/admin/config/visa-categories", async () => {
    const staff = await requireStaff();
    requirePermission(staff, "config.manage");
    const id = idSchema.parse(formData.get("id"));
    const category = await db.transaction(async (tx) => {
      // Lock the parent while checking references; concurrent FK inserts wait.
      const row = (await tx.select().from(visaCategories).where(eq(visaCategories.id, id)).for("update"))[0];
      if (!row) throw new AppError("NOT_FOUND", "Category not found.");
      const references = await tx.select({ id: visaTypes.id }).from(visaTypes).where(eq(visaTypes.categoryId, id)).limit(1);
      if (references.length) throw new AppError("REFERENCED", "This category is used by visa types. Deactivate it instead.");
      await tx.delete(visaCategories).where(eq(visaCategories.id, id));
      return row;
    });
    await recordAudit({ actor: staff, action: "CONFIG_CATEGORY_DELETED", entity: "visa_category", entityId: id, metadata: { code: category.code, mode: "hard" } });
    revalidatePath("/admin/config/visa-categories");
    return `Category "${category.name}" deleted.`;
  });
}

const visaTypeSchema = z.object({
  nameFr: z.string().trim().max(120).optional().nullable(),
  nameAr: z.string().trim().max(120).optional().nullable(),
  descriptionFr: z.string().trim().max(1000).optional().nullable(),
  descriptionAr: z.string().trim().max(1000).optional().nullable(),
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
      .values({ ...data, fee: data.fee.toFixed(2), currency: "DZD", active: false })
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
      await db.transaction(async tx => {
        const existing = (await tx.select().from(visaTypes).where(eq(visaTypes.id,id)).for("update"))[0];
        if (!existing) throw new AppError("NOT_FOUND", "Visa type not found.");
        if (!existing.active) {
          const country = (await tx.select().from(countries).where(eq(countries.id, existing.countryId)))[0];
          const category = (await tx.select().from(visaCategories).where(eq(visaCategories.id, existing.categoryId)))[0];
          const requirements = await tx.select({id:visaRequirements.id}).from(visaRequirements).innerJoin(documentTypes,eq(visaRequirements.documentTypeId,documentTypes.id)).where(and(eq(visaRequirements.visaTypeId,id),eq(visaRequirements.active,true),eq(documentTypes.active,true),eq(documentTypes.agencyUploadable,true)));
          validateVisaActivation({countryActive:country?.active??false,categoryActive:category?.active??false,name:existing.name,nameFr:existing.nameFr,nameAr:existing.nameAr,fee:existing.fee,minDays:existing.processingMinDays,maxDays:existing.processingMaxDays,agencyRequirements:requirements.length});
        }
        await tx.update(visaTypes).set({active:!existing.active,updatedAt:new Date()}).where(eq(visaTypes.id,id));
      });
      await recordAudit({ actor: staff, action: "CONFIG_VISA_TYPE_TOGGLED", entity: "visa_type", entityId: id });
    } else {
      const existing = (await db.select().from(visaTypes).where(eq(visaTypes.id, id)).limit(1))[0];
      if (!existing) throw new AppError("NOT_FOUND", "Visa type not found.");
      const data = visaTypeSchema.parse({ ...Object.fromEntries(formData), code: existing.code });
      if (existing.active) {
        const country = (await db.select().from(countries).where(eq(countries.id,data.countryId)))[0];
        const category = (await db.select().from(visaCategories).where(eq(visaCategories.id,data.categoryId)))[0];
        const requirements = await db.select({id:visaRequirements.id}).from(visaRequirements).innerJoin(documentTypes,eq(visaRequirements.documentTypeId,documentTypes.id)).where(and(eq(visaRequirements.visaTypeId,id),eq(visaRequirements.active,true),eq(documentTypes.active,true),eq(documentTypes.agencyUploadable,true)));
        validateVisaActivation({countryActive:country?.active??false,categoryActive:category?.active??false,name:data.name,nameFr:data.nameFr??null,nameAr:data.nameAr??null,fee:String(data.fee),minDays:data.processingMinDays,maxDays:data.processingMaxDays,agencyRequirements:requirements.length});
      }
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

export async function deleteVisaTypeAction(formData: FormData): Promise<void> {
  await runAction("/admin/config/visa-types", async () => {
    const staff = await requireStaff();
    requirePermission(staff, "config.manage");
    const id = idSchema.parse(formData.get("id"));
    const visaType = await db.transaction(async (tx) => {
      const row = (await tx.select().from(visaTypes).where(eq(visaTypes.id, id)).for("update"))[0];
      if (!row) throw new AppError("NOT_FOUND", "Visa type not found.");
      const applicationRefs = await tx.select({ id: applications.id }).from(applications).where(eq(applications.visaTypeId, id)).limit(1);
      const requirementRefs = await tx.select({ id: visaRequirements.id }).from(visaRequirements).where(eq(visaRequirements.visaTypeId, id)).limit(1);
      // Explicitly block the schema's requirement cascade: deletion never removes related configuration.
      if (applicationRefs.length || requirementRefs.length) throw new AppError("REFERENCED", "This visa type has applications or document requirements. Deactivate it instead.");
      await tx.delete(visaTypes).where(eq(visaTypes.id, id));
      return row;
    });
    await recordAudit({ actor: staff, action: "CONFIG_VISA_TYPE_DELETED", entity: "visa_type", entityId: id, metadata: { code: visaType.code, mode: "hard" } });
    revalidatePath("/admin/config/visa-types");
    revalidatePath("/visas");
    return `Visa type "${visaType.name}" deleted.`;
  });
}

export async function addRequirementAction(formData: FormData): Promise<void> {
  const visaTypeId = idSchema.parse(formData.get("visaTypeId"));
  await runAction(`/admin/config/visa-types/${visaTypeId}`, async () => {
    const staff = await requireStaff();
    requirePermission(staff, "config.manage");
    const documentTypeId = idSchema.parse(formData.get("documentTypeId"));
    const required = formData.get("required") === "on" || formData.get("required") === "true";
    const notes = z.string().trim().max(500).optional().nullable().parse(formData.get("notes") || null);
    const sortOrder = z.coerce.number().int().min(0).max(999).default(0).parse(formData.get("sortOrder") ?? 0);
    const inserted = await db.transaction(async (tx) => {
      const [visa] = await tx.select({ id: visaTypes.id }).from(visaTypes).where(eq(visaTypes.id, visaTypeId)).for("update");
      if (!visa) throw new AppError("NOT_FOUND", "Visa type not found.");
      const [type] = await tx.select().from(documentTypes).where(eq(documentTypes.id, documentTypeId)).for("share");
      if (!type?.active) throw new AppError("NOT_FOUND", "Document type not found or inactive.");
      assertProgrammeRequirementType(type.code);
      return tx.insert(visaRequirements).values({ visaTypeId, documentTypeId, required, notes: notes ?? null, sortOrder }).onConflictDoNothing().returning();
    });
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
    const req = await db.transaction(async (tx) => {
      const [visa] = await tx.select().from(visaTypes).where(eq(visaTypes.id, visaTypeId)).for("update");
      const [row] = await tx.select().from(visaRequirements).where(and(eq(visaRequirements.id, id), eq(visaRequirements.visaTypeId, visaTypeId)));
      if (!visa || !row) throw new AppError("NOT_FOUND", "Requirement not found.");
      if (formData.get("toggleActive")) {
        if (row.active && visa.active) {
          const remaining = await tx.select({ id: visaRequirements.id }).from(visaRequirements).innerJoin(documentTypes, eq(visaRequirements.documentTypeId, documentTypes.id)).where(and(eq(visaRequirements.visaTypeId, visaTypeId), ne(visaRequirements.id, id), eq(visaRequirements.active, true), eq(documentTypes.active, true), eq(documentTypes.agencyUploadable, true)));
          assertActiveProgrammeChecklist(visa.active, remaining.length);
        } else if (!row.active) {
          const [type] = await tx.select().from(documentTypes).where(eq(documentTypes.id, row.documentTypeId)).for("share");
          if (!type?.active) throw new AppError("VALIDATION", "Activate the document type before its requirement.");
          assertProgrammeRequirementType(type.code);
        }
        await tx.update(visaRequirements).set({ active: !row.active, updatedAt: new Date() }).where(eq(visaRequirements.id, id));
      } else if (formData.get("toggleRequired")) {
        await tx.update(visaRequirements).set({ required: !row.required, updatedAt: new Date() }).where(eq(visaRequirements.id, id));
      }
      return row;
    });
    if (formData.get("toggleActive")) {
      await recordAudit({ actor: staff, action: "CONFIG_REQUIREMENT_TOGGLED", entity: "visa_requirement", entityId: id, metadata: { active: !req.active } });
    } else if (formData.get("toggleRequired")) {
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
    await db.transaction(async (tx) => {
      const [visa] = await tx.select().from(visaTypes).where(eq(visaTypes.id, visaTypeId)).for("update");
      const [req] = await tx.select().from(visaRequirements).where(and(eq(visaRequirements.id, id), eq(visaRequirements.visaTypeId, visaTypeId)));
      if (!visa || !req) throw new AppError("NOT_FOUND", "Requirement not found.");
      if (visa.active) {
        const remaining = await tx.select({ id: visaRequirements.id }).from(visaRequirements).innerJoin(documentTypes, eq(visaRequirements.documentTypeId, documentTypes.id)).where(and(eq(visaRequirements.visaTypeId, visaTypeId), ne(visaRequirements.id, id), eq(visaRequirements.active, true), eq(documentTypes.active, true), eq(documentTypes.agencyUploadable, true)));
        assertActiveProgrammeChecklist(visa.active, remaining.length);
      }
      await tx.delete(visaRequirements).where(eq(visaRequirements.id, id));
    });
    await recordAudit({ actor: staff, action: "CONFIG_REQUIREMENT_REMOVED", entity: "visa_requirement", entityId: id, metadata: { visaTypeId } });
    revalidatePath(`/admin/config/visa-types/${visaTypeId}`);
    return "Requirement removed. Existing application checklists are preserved.";
  });
}

/* ---------------------------- document types --------------------------- */

const docTypeSchema = z.object({
  nameFr: z.string().trim().max(120).optional().nullable(),
  nameAr: z.string().trim().max(120).optional().nullable(),
  descriptionFr: z.string().trim().max(1000).optional().nullable(),
  descriptionAr: z.string().trim().max(1000).optional().nullable(),
  name: z.string().trim().min(2).max(80),
  code: codeSchema,
  description: z.string().trim().max(500).optional().nullable(),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  /**
   * "1" = checklist item the agency provides, "0" = issued by ESSAFARIA.
   * NB: z.coerce.boolean() would be WRONG here — the string "0" is truthy in JS.
   */
  agencyUploadable: z
    .union([z.literal("1"), z.literal("0"), z.boolean()])
    .transform((v) => v === true || v === "1")
    .default(true),
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

async function lockDocumentTypeForChange(tx: Pick<typeof db, "select">, id: string) {
  // Requirement edits and activation lock the visa first. Use that same order
  // and sort parents so two type changes cannot both remove the last valid type.
  const programmes = await tx.select({ id: visaTypes.id }).from(visaTypes)
    .where(and(eq(visaTypes.active, true), inArray(visaTypes.id, tx.select({ id: visaRequirements.visaTypeId }).from(visaRequirements).where(and(eq(visaRequirements.documentTypeId, id), eq(visaRequirements.active, true))))))
    .orderBy(asc(visaTypes.id)).for("update");
  const [type] = await tx.select().from(documentTypes).where(eq(documentTypes.id, id)).for("update");
  if (!type) throw new AppError("NOT_FOUND", "Document type not found.");
  return { type, programmes };
}

async function keepAgencyRequirements(tx: Pick<typeof db, "select">, programmes: { id: string }[], documentTypeId: string) {
  for (const programme of programmes) {
    const remaining = await tx.select({ id: visaRequirements.id }).from(visaRequirements)
      .innerJoin(documentTypes, eq(visaRequirements.documentTypeId, documentTypes.id))
      .where(and(eq(visaRequirements.visaTypeId, programme.id), ne(documentTypes.id, documentTypeId), eq(visaRequirements.active, true), eq(documentTypes.active, true), eq(documentTypes.agencyUploadable, true)));
    assertActiveProgrammeChecklist(true, remaining.length);
  }
}

export async function updateDocumentTypeAction(formData: FormData): Promise<void> {
  await runAction("/admin/config/document-types", async () => {
    const staff = await requireStaff();
    requirePermission(staff, "config.manage");
    const id = idSchema.parse(formData.get("id"));
    if (formData.get("toggle")) {
      await db.transaction(async (tx) => {
        const { type, programmes } = await lockDocumentTypeForChange(tx, id);
        if (type.active) {
          assertMutableDocumentType(type.code);
          if (type.agencyUploadable) await keepAgencyRequirements(tx, programmes, id);
        }
        await tx.update(documentTypes).set({ active: !type.active, updatedAt: new Date() }).where(eq(documentTypes.id, id));
      });
      await recordAudit({ actor: staff, action: "CONFIG_DOCUMENT_TYPE_TOGGLED", entity: "document_type", entityId: id });
    } else {
      await db.transaction(async (tx) => {
        const { type, programmes } = await lockDocumentTypeForChange(tx, id);
        const data = docTypeSchema.parse({ ...Object.fromEntries(formData), code: type.code });
        if (type.code.startsWith("DECISION_") && data.agencyUploadable) throw new AppError("FORBIDDEN", "Official decision types must remain Staff-issued.");
        if (type.active && type.agencyUploadable && !data.agencyUploadable) await keepAgencyRequirements(tx, programmes, id);
        await tx.update(documentTypes).set({ ...data, updatedAt: new Date() }).where(eq(documentTypes.id, id));
      });
      await recordAudit({ actor: staff, action: "CONFIG_DOCUMENT_TYPE_UPDATED", entity: "document_type", entityId: id });
    }
    revalidatePath("/admin/config/document-types");
    return "Document type saved.";
  });
}

/* ------------------------------ currencies ----------------------------- */

export async function deleteDocumentTypeAction(formData: FormData): Promise<void> {
  await runAction("/admin/config/document-types", async () => {
    const staff = await requireStaff();
    requirePermission(staff, "config.manage");
    const id = idSchema.parse(formData.get("id"));
    const docType = await db.transaction(async (tx) => {
      const row = (await tx.select().from(documentTypes).where(eq(documentTypes.id, id)).for("update"))[0];
      if (!row) throw new AppError("NOT_FOUND", "Document type not found.");
      assertMutableDocumentType(row.code);
      const requirements = await tx.select({ id: visaRequirements.id }).from(visaRequirements).where(eq(visaRequirements.documentTypeId, id)).limit(1);
      const checklists = await tx.select({ id: checklistItems.id }).from(checklistItems).where(eq(checklistItems.documentTypeId, id)).limit(1);
      const uploads = await tx.select({ id: documents.id }).from(documents).where(eq(documents.documentTypeId, id)).limit(1);
      const requests = await tx.select({ id: documentRequests.id }).from(documentRequests).where(eq(documentRequests.documentTypeId, id)).limit(1);
      if (requirements.length || checklists.length || uploads.length || requests.length) {
        throw new AppError("REFERENCED", "This document type is used by requirements, checklists or document history. Deactivate it instead.");
      }
      await tx.delete(documentTypes).where(eq(documentTypes.id, id));
      return row;
    });
    await recordAudit({ actor: staff, action: "CONFIG_DOCUMENT_TYPE_DELETED", entity: "document_type", entityId: id, metadata: { code: docType.code, mode: "hard" } });
    revalidatePath("/admin/config/document-types");
    return `Document type "${docType.name}" deleted.`;
  });
}

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
    assertWorkflowCode(data.code);
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
      assertMutableWorkflowState(st.code);
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
      const [from] = await db.select().from(statuses).where(eq(statuses.id, fromStatusId));
      const [to] = await db.select().from(statuses).where(eq(statuses.id, toStatusId));
      if (!from || !to) throw new AppError("NOT_FOUND", "Status not found.");
      assertWorkflowTransition(from.code, to.code, scope);
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
    assertMutableWorkflowState(status.code);

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
    const [from] = await db.select().from(statuses).where(eq(statuses.id, fromStatusId));
    const [to] = await db.select().from(statuses).where(eq(statuses.id, toStatusId));
    if (!from || !to) throw new AppError("NOT_FOUND", "Status not found.");
    assertWorkflowTransition(from.code, to.code, scope);
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
