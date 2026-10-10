import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, auditLogs, notifications, statuses, users, visaTypes } from "@/db/schema";
import { createSession } from "./helpers/authenticated-session";
import { createDraftApplication } from "@/lib/applications";
import { assignOfficerAction, bulkAssignAction, updateInternalNotesAction } from "@/app/actions/applications";
import { suiteSetup } from "./helpers/global-state";
import { agencyByEmail, userByEmail } from "./helpers/fixtures";
import { request } from "./helpers/request";
suiteSetup();
afterEach(() => { request.cookie = ""; });

async function fixture() {
  const actor = await userByEmail("admin@test.example"), officer = await userByEmail("agent@test.example");
  const agency = await agencyByEmail("ops@agencya.example");
  const [visa] = await db.select().from(visaTypes).where(eq(visaTypes.code, "JP-BUS"));
  const draft = await createDraftApplication({ agencyId: agency.id, visaTypeId: visa!.id, createdBy: actor });
  const [submitted] = await db.select().from(statuses).where(eq(statuses.code, "SUBMITTED"));
  const [app] = await db.update(applications).set({ statusId: submitted!.id, submittedAt: new Date() }).where(eq(applications.id, draft.id)).returning();
  request.cookie = (await createSession(actor.id)).token;
  return { app: app!, actor, officer, agency };
}
async function flash(action: (form: FormData) => Promise<void>, form: FormData) {
  try { await action(form); } catch (error) {
    const digest = String((error as { digest?: string }).digest ?? error);
    if (!digest.includes("NEXT_REDIRECT")) throw error;
    return decodeURIComponent(digest);
  }
  return "";
}
function assignmentForm(appId: string, officerId: string) {
  const form = new FormData(); form.set("applicationId", appId); form.append("ids", appId); form.set("assignedTo", officerId); return form;
}
async function rejectWrites(table: "audit_logs" | "notifications", body: () => Promise<void>) {
  await db.execute(sql`create or replace function reject_action_side_effect() returns trigger language plpgsql as $$ begin raise exception 'mandatory side effect unavailable'; end $$`);
  await db.execute(sql.raw(`create trigger reject_action_side_effect before insert on ${table} for each row execute function reject_action_side_effect()`));
  try { await body(); } finally {
    await db.execute(sql.raw(`drop trigger reject_action_side_effect on ${table}`));
    await db.execute(sql`drop function reject_action_side_effect()`);
  }
}
describe("application action audit and assignment atomicity", () => {
  it.each(["single", "bulk", "notes"])("%s mutation rolls back when its mandatory audit cannot persist", async (operation) => {
    const { app, officer } = await fixture();
    const form = assignmentForm(app.id, officer.id); form.set("internalNotes", "New confidential processing note");
    const action = operation === "single" ? assignOfficerAction : operation === "bulk" ? bulkAssignAction : updateInternalNotesAction;
    await rejectWrites("audit_logs", async () => {
      expect(await flash(action, form)).toMatch(/error=/);
      expect((await db.select().from(applications).where(eq(applications.id, app.id)))[0]).toEqual(app);
      expect(await db.select().from(notifications).where(eq(notifications.applicationId, app.id))).toHaveLength(0);
    });
  });
  it.each(["single", "bulk"])("%s assignment and audit roll back if its required officer notification cannot persist", async (operation) => {
    const { app, officer } = await fixture();
    await rejectWrites("notifications", async () => {
      expect(await flash(operation === "single" ? assignOfficerAction : bulkAssignAction, assignmentForm(app.id, officer.id))).toMatch(/error=/);
      expect((await db.select().from(applications).where(eq(applications.id, app.id)))[0]).toEqual(app);
      expect(await db.select().from(auditLogs).where(and(eq(auditLogs.entityId, app.id), eq(auditLogs.action, "APPLICATION_ASSIGNED")))).toHaveLength(0);
    });
  });
  it.each(["single", "bulk"])("%s assignment commits readable audit and correlated notification together", async (operation) => {
    const { app, officer, actor, agency } = await fixture();
    expect(await flash(operation === "single" ? assignOfficerAction : bulkAssignAction, assignmentForm(app.id, officer.id))).toMatch(/ok=/);
    const [audit] = await db.select().from(auditLogs).where(and(eq(auditLogs.entityId, app.id), eq(auditLogs.action, "APPLICATION_ASSIGNED")));
    expect(audit?.metadata).toMatchObject({ reference: app.reference, oldAssignedTo: null, assignedTo: officer.id, assignedToName: officer.name });
    expect(audit?.agencyId).toBe(agency.id); expect(audit?.actorId).toBe(actor.id);
    const [note] = await db.select().from(notifications).where(eq(notifications.applicationId, app.id));
    expect(note).toMatchObject({ userId: officer.id, type: "APPLICATION_ASSIGNED", agencyId: agency.id, link: `/admin/applications/${app.id}` });
  });
  it.each(["single", "bulk"])("%s assignment refuses a pending activation officer without changing the application", async (operation) => {
    const { app, officer } = await fixture();
    await db.update(users).set({ activationPending: true }).where(eq(users.id, officer.id));
    try {
      expect(await flash(operation === "single" ? assignOfficerAction : bulkAssignAction, assignmentForm(app.id, officer.id))).toMatch(/error=/);
      expect((await db.select().from(applications).where(eq(applications.id, app.id)))[0]).toEqual(app);
    } finally { await db.update(users).set({ activationPending: false }).where(eq(users.id, officer.id)); }
  });
  it.each(["single", "bulk"])("%s assignment refuses a suspended officer without changing the application", async (operation) => {
    const { app, officer } = await fixture();
    await db.update(users).set({ status: "SUSPENDED" }).where(eq(users.id, officer.id));
    try {
      expect(await flash(operation === "single" ? assignOfficerAction : bulkAssignAction, assignmentForm(app.id, officer.id))).toMatch(/error=/);
      expect((await db.select().from(applications).where(eq(applications.id, app.id)))[0]).toEqual(app);
    } finally { await db.update(users).set({ status: "ACTIVE" }).where(eq(users.id, officer.id)); }
  });
  it.each(["single", "bulk"])("%s assignment refuses an Agency account", async (operation) => {
    const { app } = await fixture(); const agencyActor = await userByEmail("a-admin@test.example");
    expect(await flash(operation === "single" ? assignOfficerAction : bulkAssignAction, assignmentForm(app.id, agencyActor.id))).toMatch(/error=/);
    expect((await db.select().from(applications).where(eq(applications.id, app.id)))[0]).toEqual(app);
  });
  it("internal notes audit preserves the reference and before/after values", async () => {
    const { app, actor, agency } = await fixture();
    const form = new FormData(); form.set("applicationId", app.id); form.set("internalNotes", "Embassy appointment confirmed");
    expect(await flash(updateInternalNotesAction, form)).toMatch(/ok=/);
    const [audit] = await db.select().from(auditLogs).where(and(eq(auditLogs.entityId, app.id), eq(auditLogs.action, "APPLICATION_NOTES_UPDATED")));
    expect(audit).toMatchObject({ actorId: actor.id, agencyId: agency.id, metadata: { reference: app.reference, oldInternalNotes: null, newInternalNotes: "Embassy appointment confirmed" } });
  });
  it.each(["single", "notes"])("%s mutation refuses a nonexistent application without a misleading audit", async (operation) => {
    const { officer } = await fixture(); const missingId = crypto.randomUUID();
    const form = assignmentForm(missingId, officer.id); form.set("internalNotes", "Must not persist for a missing application");
    expect(await flash(operation === "single" ? assignOfficerAction : updateInternalNotesAction, form)).toMatch(/error=/);
    expect(await db.select().from(auditLogs).where(eq(auditLogs.entityId, missingId))).toHaveLength(0);
  });
  it.each(["single", "bulk", "notes"])("%s mutation rechecks a suspended actor despite an existing session", async (operation) => {
    const { app, actor, officer } = await fixture();
    await db.update(users).set({ status: "SUSPENDED" }).where(eq(users.id, actor.id));
    try {
      const form = assignmentForm(app.id, officer.id); form.set("internalNotes", "Attempt with stale actor session");
      expect(await flash(operation === "single" ? assignOfficerAction : operation === "bulk" ? bulkAssignAction : updateInternalNotesAction, form)).toMatch(/error=/);
      expect((await db.select().from(applications).where(eq(applications.id, app.id)))[0]).toEqual(app);
    } finally { await db.update(users).set({ status: "ACTIVE" }).where(eq(users.id, actor.id)); }
  });
  it.each(["single", "bulk", "notes"])("%s mutation refuses an Agency actor even when it posts a Staff action form", async (operation) => {
    const { app, officer } = await fixture();
    request.cookie = (await createSession((await userByEmail("a-admin@test.example")).id)).token;
    const form = assignmentForm(app.id, officer.id); form.set("internalNotes", "Agency attempt to replace private staff notes");
    expect(await flash(operation === "single" ? assignOfficerAction : operation === "bulk" ? bulkAssignAction : updateInternalNotesAction, form)).toMatch(/error=/);
    expect((await db.select().from(applications).where(eq(applications.id, app.id)))[0]).toEqual(app);
  });
  it("bulk assignment refuses terminal metadata even for an unfamiliar configured status", async () => {
    const { app, officer } = await fixture();
    const [terminal] = await db.insert(statuses).values({ code: `ARCHIVED_${crypto.randomUUID().slice(0, 8)}`, name: "Archived historical dossier", isTerminal: true }).returning();
    await db.update(applications).set({ statusId: terminal!.id }).where(eq(applications.id, app.id));
    expect(await flash(bulkAssignAction, assignmentForm(app.id, officer.id))).toMatch(/error=/);
    expect((await db.select().from(applications).where(eq(applications.id, app.id)))[0]?.assignedTo).toBeNull();
  });
});
