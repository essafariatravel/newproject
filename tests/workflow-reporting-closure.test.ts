import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
import { suiteSetup } from "./helpers/global-state";
import { request } from "./helpers/request";
import { agencyByEmail, userByEmail } from "./helpers/fixtures";
import { createSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { and, eq, sql } from "drizzle-orm";
import { applicants, applications, auditLogs, documentRequests, priorities, statuses, visaTypes } from "@/db/schema";
import { changeApplicationStatus, createDraftApplication, recordApplicationDecision } from "@/lib/applications";
import { submitVisaRequest } from "@/lib/requests";
import { agencyDashboard, reportData, searchApplications } from "@/lib/queries";
import { addApplicantAction, bulkPriorityAction, createApplicationAction, removeApplicantAction, updateApplicantAction } from "@/app/actions/applications";
import { parseReportFilters } from "@/lib/report-filters";
import { adjustWallet } from "@/lib/wallet";
suiteSetup();
afterEach(() => { request.cookie = ""; });

async function fixture() {
  const actor = await userByEmail("a-admin@test.example");
  const agency = await agencyByEmail("ops@agencya.example");
  const [visa] = await db.select().from(visaTypes).where(eq(visaTypes.code, "JP-BUS"));
  const app = await createDraftApplication({ agencyId: agency.id, visaTypeId: visa!.id, createdBy: actor });
  const [traveller] = await db.insert(applicants).values({ applicationId: app.id, firstName: "Amine Bekkali", lastName: "", fullName: "Amine Bekkali", nationality: "DZ" }).returning();
  const [submitted] = await db.select().from(statuses).where(eq(statuses.code, "SUBMITTED"));
  await db.update(applications).set({ statusId: submitted!.id, submittedAt: new Date("2026-06-05T12:00:00Z") }).where(eq(applications.id, app.id));
  return { actor, agency, visa: visa!, app, traveller: traveller! };
}
async function act(email: string) { request.cookie = (await createSession((await userByEmail(email)).id)).token; }
async function flash(action: (form: FormData) => Promise<void>, form: FormData) {
  try { await action(form); } catch (error) {
    const digest = String((error as { digest?: string }).digest ?? error);
    if (!digest.includes("NEXT_REDIRECT")) throw error;
    return decodeURIComponent(digest);
  }
  return "";
}

describe("final workflow and reporting closure", () => {
  it("obsolete draft creation refuses without persisting a draft", async () => {
    await act("a-admin@test.example");
    const [visa] = await db.select().from(visaTypes).where(eq(visaTypes.code, "JP-BUS"));
    const before = await db.select({ id: applications.id }).from(applications);
    const form = new FormData(); form.set("visaTypeId", visa!.id);
    expect(await flash(createApplicationAction, form)).toMatch(/error=/);
    expect(await db.select({ id: applications.id }).from(applications)).toHaveLength(before.length);
  });
  it.each(["add", "update", "remove"])("obsolete %s traveller action refuses and leaves submitted dossier unchanged", async (operation) => {
    const { app, traveller } = await fixture(); await act("a-admin@test.example");
    const form = new FormData();
    for (const [key, value] of Object.entries({ applicationId: app.id, applicantId: traveller.id, firstName: "Forged", lastName: "Traveller", dateOfBirth: "1990-01-01", nationality: "DZ", passportNumber: "A1234567", passportExpiryDate: "2035-01-01" })) form.set(key, value);
    const action = operation === "add" ? addApplicantAction : operation === "update" ? updateApplicantAction : removeApplicantAction;
    expect(await flash(action, form)).toMatch(/error=/);
    expect(await db.select().from(applicants).where(eq(applicants.applicationId, app.id))).toEqual([traveller]);
  });
  it.each(["URGENT", "EXPRESS"])("Agency cannot submit %s priority even when configured", async (priorityCode) => {
    const { actor, visa, agency } = await fixture();
    await adjustWallet({ agencyId: agency.id, actor: await userByEmail("admin@test.example"), amount: 1000, reason: "Local priority regression funding" });
    await db.insert(priorities).values({ code: priorityCode, name: priorityCode, active: true }).onConflictDoNothing();
    const requirements = (await db.execute(sql`select document_type_id as id from visa_requirements where visa_type_id=${visa.id} and active`)).rows as { id: string }[];
    const documents = requirements.map(({ id }) => ({ documentTypeId: id, file: { name: "scan.pdf", type: "application/pdf", size: 20, data: Buffer.from("%PDF-1.4 fixture file") } }));
    const before = await db.select({ id: applications.id }).from(applications);
    await expect(submitVisaRequest({ actor, countryId: visa.countryId, visaTypeId: visa.id, idempotencyKey: crypto.randomUUID(), priorityCode, travellers: [{ fullName: "Test Traveller", nationality: "DZ" }], documents })).rejects.toMatchObject({ code: "PRIORITY_INVALID" });
    expect(await db.select({ id: applications.id }).from(applications)).toHaveLength(before.length);
  });
  it("inactive STANDARD cannot be booked by an Agency", async () => {
    const { actor, visa } = await fixture();
    await db.update(priorities).set({ active: false }).where(eq(priorities.code, "STANDARD"));
    try {
      await expect(submitVisaRequest({ actor, countryId: visa.countryId, visaTypeId: visa.id, idempotencyKey: crypto.randomUUID(), travellers: [{ fullName: "Test Traveller", nationality: "DZ" }], documents: [] })).rejects.toMatchObject({ code: "PRIORITY_INVALID" });
    } finally { await db.update(priorities).set({ active: true }).where(eq(priorities.code, "STANDARD")); }
  });
  it("Staff escalation requires a reason and atomically records old and new priority", async () => {
    const { app } = await fixture(); await act("agent@test.example");
    const [urgent] = await db.select().from(priorities).where(eq(priorities.code, "URGENT"));
    const form = new FormData(); form.append("ids", app.id); form.set("priorityId", urgent!.id);
    expect(await flash(bulkPriorityAction, form)).toMatch(/error=/);
    expect((await db.select().from(applications).where(eq(applications.id, app.id)))[0]!.priorityId).toBe(app.priorityId);
    form.set("reason", "Departure moved forward by embassy");
    expect(await flash(bulkPriorityAction, form)).toMatch(/ok=/);
    const [audit] = await db.select().from(auditLogs).where(and(eq(auditLogs.entityId, app.id), eq(auditLogs.action, "APPLICATION_PRIORITY_CHANGED")));
    expect(audit?.metadata).toMatchObject({ oldPriorityId: app.priorityId, newPriorityId: urgent!.id, reason: "Departure moved forward by embassy" });
  });
  it.each(["a-admin@test.example", "b-admin@test.example"])("Agency actor %s cannot call Staff priority escalation for an owned or foreign dossier", async (email) => {
    const { app } = await fixture(); await act(email);
    const [urgent] = await db.select().from(priorities).where(eq(priorities.code, "URGENT"));
    const form = new FormData(); form.append("ids", app.id); form.set("priorityId", urgent!.id); form.set("reason", "Forged Agency request with valid reason");
    expect(await flash(bulkPriorityAction, form)).toMatch(/error=/);
    expect((await db.select().from(applications).where(eq(applications.id, app.id)))[0]?.priorityId).toBe(app.priorityId);
    expect(await db.select().from(auditLogs).where(and(eq(auditLogs.entityId, app.id), eq(auditLogs.action, "APPLICATION_PRIORITY_CHANGED")))).toHaveLength(0);
  });
  it("submission reports use submittedAt and decisions use decisionAt independently of createdAt", async () => {
    const { app, agency, visa } = await fixture();
    const [isolatedVisa] = await db.insert(visaTypes).values({ ...visa, id: undefined, code: `REPORT_${crypto.randomUUID().slice(0, 8)}` }).returning();
    await db.update(applications).set({ visaTypeId: isolatedVisa!.id }).where(eq(applications.id, app.id));
    await db.update(applications).set({ createdAt: new Date("2026-01-01T12:00:00Z"), decisionAt: new Date("2026-07-08T12:00:00Z") }).where(eq(applications.id, app.id));
    const scope = { agencyId: agency.id, visaTypeId: isolatedVisa!.id };
    const submitted = await reportData({ ...parseReportFilters({ from: "2026-06-05", to: "2026-06-05" }), ...scope });
    expect(submitted.byAgency.find((r) => r.agencyId === agency.id)?.total).toBe(1);
    expect(submitted.processing.decided).toBe(0);
    const decided = await reportData({ ...parseReportFilters({ from: "2026-07-08", to: "2026-07-08" }), ...scope });
    expect(decided.processing.decided).toBe(1);
    expect(decided.byAgency).toHaveLength(0);
    const created = await reportData({ ...parseReportFilters({ from: "2026-01-01", to: "2026-01-01" }), ...scope });
    expect(created.byAgency).toHaveLength(0); expect(created.processing.decided).toBe(0);
  });
  it("reports omit zero-activity agencies by default", async () => {
    const data = await reportData(parseReportFilters({ from: "2000-01-01", to: "2000-01-01" }));
    expect(data.byAgency).toHaveLength(0);
  });
  it.each(["create", "status", "priority"])("%s mutation rolls back if its mandatory audit insert fails", async (operation) => {
    const { app, actor, agency, visa } = await fixture();
    await act("agent@test.example");
    const before = (await db.select().from(applications).where(eq(applications.id, app.id)))[0]!;
    const allBefore = await db.select({ id: applications.id }).from(applications);
    await db.execute(sql`create or replace function reject_workflow_audit() returns trigger language plpgsql as $$ begin raise exception 'audit unavailable fixture'; end $$`);
    await db.execute(sql`create trigger reject_workflow_audit before insert on audit_logs for each row execute function reject_workflow_audit()`);
    try {
      if (operation === "create") await expect(createDraftApplication({ agencyId: agency.id, visaTypeId: visa.id, createdBy: actor })).rejects.toBeDefined();
      if (operation === "status") await expect(changeApplicationStatus({ applicationId: app.id, actor: await userByEmail("agent@test.example"), toStatusCode: "DOCUMENTS_CHECKING" })).rejects.toBeDefined();
      if (operation === "priority") {
        const [urgent] = await db.select().from(priorities).where(eq(priorities.code, "URGENT"));
        const form = new FormData(); form.append("ids", app.id); form.set("priorityId", urgent!.id); form.set("reason", "Embassy departure advanced");
        expect(await flash(bulkPriorityAction, form)).toMatch(/error=/);
      }
      expect(await db.select({ id: applications.id }).from(applications)).toHaveLength(allBefore.length);
      expect((await db.select().from(applications).where(eq(applications.id, app.id)))[0]).toEqual(before);
    } finally {
      await db.execute(sql`drop trigger reject_workflow_audit on audit_logs`);
      await db.execute(sql`drop function reject_workflow_audit()`);
    }
  });
  it("completed dashboard KPI and filtered list contain the same approved and legacy completed dossiers", async () => {
    const { actor, app, agency } = await fixture();
    const [completed] = await db.insert(statuses).values({ code: "COMPLETED", name: "Completed", active: false, isTerminal: true }).onConflictDoUpdate({ target: statuses.code, set: { isTerminal: true } }).returning();
    const staff = await userByEmail("agent@test.example");
    const [processing] = await db.select().from(statuses).where(eq(statuses.code, "IN_PROCESS"));
    await db.update(applications).set({ statusId: processing!.id }).where(eq(applications.id, app.id));
    const file = { name: "official.pdf", type: "application/pdf", size: 20, data: Buffer.from("%PDF-1.4 official fixture") };
    await recordApplicationDecision({ applicationId: app.id, actor: staff, outcome: "APPROVED", file });
    const legacy = await createDraftApplication({ agencyId: agency.id, visaTypeId: app.visaTypeId, createdBy: actor });
    await db.update(applications).set({ statusId: completed!.id }).where(eq(applications.id, legacy.id));
    const rejected = await createDraftApplication({ agencyId: agency.id, visaTypeId: app.visaTypeId, createdBy: actor });
    await db.update(applications).set({ statusId: processing!.id }).where(eq(applications.id, rejected.id));
    await recordApplicationDecision({ applicationId: rejected.id, actor: staff, outcome: "REJECTED", file });
    const dashboard = await agencyDashboard(agency.id, actor.id);
    const list = await searchApplications(actor, { queue: "completed" });
    expect(list.total).toBe(Number(dashboard.totals.completed));
    expect(list.rows.every((row) => ["APPROVED", "COMPLETED"].includes(row.statusCode))).toBe(true);
  });
  it("Next Action follows the live open document request and clears on fulfilment", async () => {
    const { actor, app } = await fixture();
    const [checklist] = (await db.execute(sql`select id,document_type_id from checklist_items where application_id=${app.id} limit 1`)).rows as { id: string; document_type_id: string }[];
    const [requested] = await db.insert(documentRequests).values({ applicationId: app.id, checklistItemId: checklist!.id, documentTypeId: checklist!.document_type_id, type: "REPLACEMENT", reason: "Supply clear scan", requestedBy: (await userByEmail("agent@test.example")).id }).returning();
    const open = await searchApplications(actor, { q: app.reference });
    expect(open.rows[0]).toMatchObject({ agencyNextAction: "Upload requested documents" });
    await db.update(documentRequests).set({ status: "FULFILLED" }).where(eq(documentRequests.id, requested!.id));
    const fulfilled = await searchApplications(actor, { q: app.reference });
    expect(fulfilled.rows[0]).toMatchObject({ agencyNextAction: "Await ESSAFARIA review" });
  });
});
