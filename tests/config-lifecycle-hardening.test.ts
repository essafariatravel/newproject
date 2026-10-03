import { afterEach, describe, expect, it, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { suiteSetup } from "./helpers/global-state";
import { request } from "./helpers/request";
import { agencyByEmail, userByEmail } from "./helpers/fixtures";
import { db } from "@/lib/db";
import { applications, documentTypes, statuses, statusTransitions, visaRequirements, visaTypes } from "@/db/schema";
import { changeApplicationStatus, createDraftApplication, getStatusByCode } from "@/lib/applications";
import { createSession } from "@/lib/auth";
import { updateDocumentTypeAction, updateStatusAction, updateVisaTypeAction } from "@/app/actions/config";

suiteSetup();
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
afterEach(async () => {
  request.cookie = "";
  await db.execute(sql`drop trigger if exists config_audit_test_failure on audit_logs`);
  await db.execute(sql`drop function if exists config_audit_test_failure()`);
});

async function rejectConfigAudit(action: string) {
  if (!/^[A-Z_]+$/.test(action)) throw new Error("Invalid test action");
  await db.execute(sql.raw(`create function config_audit_test_failure() returns trigger language plpgsql as $
    begin if new.action='${action}' then raise exception 'Config audit unavailable'; end if; return new; end $`));
  await db.execute(sql`create trigger config_audit_test_failure before insert on audit_logs for each row execute function config_audit_test_failure()`);
}

async function newProgramme(typeCount = 1) {
  request.cookie = (await createSession((await userByEmail("admin@test.example")).id)).token;
  const [base] = await db.select().from(visaTypes).where(eq(visaTypes.code, "JP-BUS"));
  const [visa] = await db.insert(visaTypes).values({ ...base!, id: undefined, code: `GUARD_${crypto.randomUUID().slice(0, 8)}` }).returning();
  const types = await db.insert(documentTypes).values(Array.from({ length: typeCount }, () => ({ name: "Agency certificate", code: `GUARD_${crypto.randomUUID().slice(0, 8)}`, agencyUploadable: true }))).returning();
  await db.insert(visaRequirements).values(types.map((type) => ({ visaTypeId: visa!.id, documentTypeId: type.id, required: true })));
  return { visa: visa!, types };
}

function originForm(type: typeof documentTypes.$inferSelect) {
  const form = new FormData(); form.set("id", type.id); form.set("name", type.name); form.set("sortOrder", "0"); form.set("agencyUploadable", "0");
  return form;
}

describe("configuration cannot invalidate the live workflow", () => {
  it.each(["disable", "change origin"])("cannot %s the last Agency document type of an active programme", async (operation) => {
    const { types } = await newProgramme(), type = types[0]!;
    const form = operation === "disable" ? new FormData() : originForm(type);
    if (operation === "disable") { form.set("id", type.id); form.set("toggle", "1"); }
    await expect(updateDocumentTypeAction(form)).rejects.toThrow(/NEXT_REDIRECT/);
    const [saved] = await db.select().from(documentTypes).where(eq(documentTypes.id, type.id));
    expect(saved!.active).toBe(true); expect(saved!.agencyUploadable).toBe(true);
  });

  it("serializes two document origin changes so the programme keeps one valid Agency type", async () => {
    const { types } = await newProgramme(2);
    await Promise.allSettled(types.map((type) => updateDocumentTypeAction(originForm(type))));
    const saved = await db.select().from(documentTypes);
    expect(saved.filter((type) => types.some((original) => original.id === type.id) && type.active && type.agencyUploadable)).toHaveLength(1);
  });

  it("a crafted graph cannot move an uncharged draft into processing", async () => {
    const actor = await userByEmail("admin@test.example"), agency = await agencyByEmail("ops@agencya.example");
    const [visa] = await db.select().from(visaTypes).where(eq(visaTypes.code, "JP-BUS"));
    const app = await createDraftApplication({ agencyId: agency.id, visaTypeId: visa!.id, createdBy: actor });
    const to = await getStatusByCode("IN_PROCESS");
    await db.insert(statusTransitions).values({ fromStatusId: app.statusId, toStatusId: to.id, scope: "STAFF" });
    try {
      await expect(changeApplicationStatus({ applicationId: app.id, toStatusCode: to.code, actor })).rejects.toMatchObject({ code: "SUBMISSION_REQUIRED" });
      expect((await db.select().from(applications).where(eq(applications.id, app.id)))[0]!.submittedAt).toBeNull();
    } finally { await db.delete(statusTransitions).where(and(eq(statusTransitions.fromStatusId, app.statusId), eq(statusTransitions.toStatusId, to.id))); }
  });

  it("a configured Agency scope cannot grant Agency users Staff processing rights", async () => {
    const actor = await userByEmail("a-admin@test.example"), agency = await agencyByEmail("ops@agencya.example");
    const [visa] = await db.select().from(visaTypes).where(eq(visaTypes.code, "JP-BUS"));
    const app = await createDraftApplication({ agencyId: agency.id, visaTypeId: visa!.id, createdBy: actor });
    const from = await getStatusByCode("SUBMITTED"), to = await getStatusByCode("DOCUMENTS_CHECKING");
    await db.update(applications).set({ statusId: from.id, submittedAt: new Date() }).where(eq(applications.id, app.id));
    await db.update(statusTransitions).set({ scope: "BOTH" }).where(and(eq(statusTransitions.fromStatusId, from.id), eq(statusTransitions.toStatusId, to.id)));
    try {
      await expect(changeApplicationStatus({ applicationId: app.id, toStatusCode: to.code, actor })).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect((await db.select().from(applications).where(eq(applications.id, app.id)))[0]!.statusId).toBe(from.id);
    } finally { await db.update(statusTransitions).set({ scope: "STAFF" }).where(and(eq(statusTransitions.fromStatusId, from.id), eq(statusTransitions.toStatusId, to.id))); }
  });

  it("rolls back a visa fee edit when its audit cannot be persisted", async () => {
    request.cookie = (await createSession((await userByEmail("admin@test.example")).id)).token;
    const [base] = await db.select().from(visaTypes).limit(1);
    expect(base).toBeDefined();
    const [visa] = await db.insert(visaTypes).values({
      ...base!,
      id: undefined,
      code: `AUDIT_${crypto.randomUUID().slice(0, 8)}`,
      active: false,
      fee: "1000.00",
    }).returning();
    try {
      await rejectConfigAudit("CONFIG_VISA_TYPE_UPDATED");
      const form = new FormData();
      form.set("id", visa!.id);
      form.set("name", visa!.name);
      form.set("nameFr", visa!.nameFr ?? "");
      form.set("nameAr", visa!.nameAr ?? "");
      form.set("description", visa!.description ?? "");
      form.set("countryId", visa!.countryId);
      form.set("categoryId", visa!.categoryId);
      form.set("processingMinDays", String(visa!.processingMinDays));
      form.set("processingMaxDays", String(visa!.processingMaxDays));
      form.set("fee", "1500");
      form.set("embassyApplicability", visa!.embassyApplicability);
      await expect(updateVisaTypeAction(form)).rejects.toThrow(/NEXT_REDIRECT/);
      const [after] = await db.select().from(visaTypes).where(eq(visaTypes.id, visa!.id));
      expect(after!.fee).toBe("1000.00");
    } finally {
      await db.delete(visaTypes).where(eq(visaTypes.id, visa!.id));
    }
  });

  it("rolls back a status edit when its audit cannot be persisted", async () => {
    request.cookie = (await createSession((await userByEmail("admin@test.example")).id)).token;
    const [status] = await db.select().from(statuses).limit(1);
    expect(status).toBeDefined();
    const before = { name: status!.name, nameFr: status!.nameFr, nameAr: status!.nameAr, description: status!.description, sortOrder: status!.sortOrder };
    await rejectConfigAudit("CONFIG_STATUS_UPDATED");
    const form = new FormData();
    form.set("id", status!.id);
    form.set("name", `${status!.name} changed`);
    form.set("nameFr", status!.nameFr ?? "");
    form.set("nameAr", status!.nameAr ?? "");
    form.set("description", status!.description ?? "");
    form.set("sortOrder", String(status!.sortOrder));
    await expect(updateStatusAction(form)).rejects.toThrow(/NEXT_REDIRECT/);
    const [after] = await db.select().from(statuses).where(eq(statuses.id, status!.id));
    expect({ name: after!.name, nameFr: after!.nameFr, nameAr: after!.nameAr, description: after!.description, sortOrder: after!.sortOrder }).toEqual(before);
  });

  it("configuration refuses giving an Agency scope to an operational Staff transition", async () => {
    request.cookie = (await createSession((await userByEmail("admin@test.example")).id)).token;
    const from = await getStatusByCode("SUBMITTED"), to = await getStatusByCode("DOCUMENTS_CHECKING");
    const form = new FormData(); form.set("id", to.id); form.set("fromStatusId", from.id); form.set("transitionScope", "BOTH");
    try {
      await expect(updateStatusAction(form)).rejects.toThrow(/NEXT_REDIRECT/);
      expect((await db.select().from(statusTransitions).where(and(eq(statusTransitions.fromStatusId, from.id), eq(statusTransitions.toStatusId, to.id))))[0]!.scope).toBe("STAFF");
    } finally { await db.update(statusTransitions).set({ scope: "STAFF" }).where(and(eq(statusTransitions.fromStatusId, from.id), eq(statusTransitions.toStatusId, to.id))); }
  });
});
