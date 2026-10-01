import { afterEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { suiteSetup } from "./helpers/global-state";
import { request } from "./helpers/request";
import { agencyByEmail, userByEmail } from "./helpers/fixtures";
import { db } from "@/lib/db";
import { applications, countries, documentTypes, visaCategories, visaRequirements, visaTypes } from "@/db/schema";
import { createDraftApplication } from "@/lib/applications";
import { activeVisaOptions, reportData } from "@/lib/queries";
import { createSession } from "@/lib/auth";
import { staffDirectory } from "@/app/actions/communications";
import { addRequirementAction, deleteDocumentTypeAction, removeRequirementAction, updateDocumentTypeAction, updateRequirementAction } from "@/app/actions/config";

suiteSetup();
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
afterEach(() => { request.cookie = ""; });

async function programme() {
  const [visa] = await db.select().from(visaTypes).where(eq(visaTypes.code, "JP-BUS"));
  return visa!;
}

describe("operational read-model consistency", () => {
  it("includes every operational Staff account in assignments and workload", async () => {
    const accounting = await userByEmail("accounting@test.example"), admin = await userByEmail("admin@test.example");
    const agency = await agencyByEmail("ops@agencya.example"), visa = await programme();
    const app = await createDraftApplication({ agencyId: agency.id, visaTypeId: visa.id, createdBy: admin });
    await db.update(applications).set({ assignedTo: accounting.id }).where(eq(applications.id, app.id));
    expect((await reportData({ officerId: accounting.id })).workload).toEqual([{ officer: accounting.name, assigned: 1 }]);
    request.cookie = (await createSession(admin.id)).token;
    expect((await staffDirectory()).map((user) => user.id)).toContain(accounting.id);
  });

  it("hides a programme whose category is inactive without rewriting its historical snapshot", async () => {
    const visa = await programme(), agency = await agencyByEmail("ops@agencya.example"), actor = await userByEmail("a-admin@test.example");
    const history = await createDraftApplication({ agencyId: agency.id, visaTypeId: visa.id, createdBy: actor });
    await db.update(visaCategories).set({ active: false }).where(eq(visaCategories.id, visa.categoryId));
    try {
      expect((await activeVisaOptions()).map((option) => option.id)).not.toContain(visa.id);
      expect((await db.select().from(applications).where(eq(applications.id, history.id)))[0]?.categoryName).toBe(history.categoryName);
    } finally { await db.update(visaCategories).set({ active: true }).where(eq(visaCategories.id, visa.categoryId)); }
  });

  it.each(["country", "category"])("refuses a stale draft submission after its %s is disabled", async (dimension) => {
    const visa = await programme(), agency = await agencyByEmail("ops@agencya.example"), actor = await userByEmail("a-admin@test.example");
    const table = dimension === "country" ? countries : visaCategories, id = dimension === "country" ? visa.countryId : visa.categoryId;
    const before = ((await db.execute(sql`select count(*)::int as n from applications`)).rows[0] as { n: number }).n;
    await db.update(table).set({ active: false }).where(eq(table.id, id));
    try {
      await expect(createDraftApplication({ agencyId: agency.id, visaTypeId: visa.id, createdBy: actor })).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(((await db.execute(sql`select count(*)::int as n from applications`)).rows[0] as { n: number }).n).toBe(before);
    } finally { await db.update(table).set({ active: true }).where(eq(table.id, id)); }
  });

  it("keeps official decision document types active and prevents deleting them before their first decision", async () => {
    request.cookie = (await createSession((await userByEmail("admin@test.example")).id)).token;
    const [type] = await db.select().from(documentTypes).where(eq(documentTypes.code, "DECISION_VISA_APPROVAL"));
    const toggle = new FormData(); toggle.set("id", type!.id); toggle.set("toggle", "1");
    try {
      await expect(updateDocumentTypeAction(toggle)).rejects.toThrow(/NEXT_REDIRECT/);
      expect((await db.select().from(documentTypes).where(eq(documentTypes.id, type!.id)))[0]?.active).toBe(true);
      const remove = new FormData(); remove.set("id", type!.id);
      await expect(deleteDocumentTypeAction(remove)).rejects.toThrow(/NEXT_REDIRECT/);
      expect((await db.select().from(documentTypes).where(eq(documentTypes.id, type!.id)))[0]?.code).toBe(type!.code);
    } finally {
      await db.insert(documentTypes).values(type!).onConflictDoUpdate({ target: documentTypes.id, set: { active: true } });
    }
  });

  it("keeps final decision documents out of programme upload requirements", async () => {
    request.cookie = (await createSession((await userByEmail("admin@test.example")).id)).token;
    const visa = await programme();
    const [type] = await db.select().from(documentTypes).where(eq(documentTypes.code, "DECISION_REFUSAL_LETTER"));
    const form = new FormData(); form.set("visaTypeId", visa.id); form.set("documentTypeId", type!.id); form.set("required", "true");
    try {
      await expect(addRequirementAction(form)).rejects.toThrow(/NEXT_REDIRECT/);
      expect(await db.select().from(visaRequirements).where(eq(visaRequirements.documentTypeId, type!.id))).toHaveLength(0);
    } finally { await db.delete(visaRequirements).where(eq(visaRequirements.documentTypeId, type!.id)); }
  });

  it.each(["disable", "remove"])("cannot %s the last Agency upload requirement of an active programme", async (operation) => {
    request.cookie = (await createSession((await userByEmail("admin@test.example")).id)).token;
    const base = await programme();
    const [visa] = await db.insert(visaTypes).values({ ...base, id: undefined, code: `GUARD_${crypto.randomUUID().slice(0, 8)}` }).returning();
    const [type] = await db.select().from(documentTypes).where(eq(documentTypes.code, "PASSPORT"));
    const [requirement] = await db.insert(visaRequirements).values({ visaTypeId: visa!.id, documentTypeId: type!.id, required: true }).returning();
    const form = new FormData(); form.set("id", requirement!.id); form.set("visaTypeId", visa!.id);
    if (operation === "disable") form.set("toggleActive", "1");
    try {
      await expect(operation === "disable" ? updateRequirementAction(form) : removeRequirementAction(form)).rejects.toThrow(/NEXT_REDIRECT/);
      expect((await db.select().from(visaRequirements).where(eq(visaRequirements.id, requirement!.id)))[0]?.active).toBe(true);
      expect((await db.select().from(visaTypes).where(eq(visaTypes.id, visa!.id)))[0]?.active).toBe(true);
    } finally {
      await db.delete(visaRequirements).where(eq(visaRequirements.visaTypeId, visa!.id));
      await db.delete(visaTypes).where(eq(visaTypes.id, visa!.id));
    }
  });
});
