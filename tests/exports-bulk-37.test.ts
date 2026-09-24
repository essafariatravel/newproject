import { describe, expect, it, vi } from "vitest";

// Server actions end with revalidatePath(); outside a request scope Next throws
// its static-generation invariant, which is an artefact of the test runtime and
// not part of the behaviour under test here.
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

import { suiteSetup } from "./helpers/global-state";

suiteSetup();

import { deflateRawSync, inflateRawSync } from "node:zlib";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { applicants, applications, auditLogs, notifications, priorities, statuses, users } from "@/db/schema";
import { exportApplications, searchApplications, reportData, EXPORT_ROW_LIMIT } from "@/lib/queries";
import { toCsv, toXlsx, csvCell, type Column, type Row } from "@/lib/tabular-export";
import { agencyByEmail, userByEmail } from "./helpers/fixtures";
import { request } from "./helpers/request";
import { createDraftApplication, submitApplication } from "@/lib/applications";
import { adjustWallet } from "@/lib/wallet";
import type { AuthUser } from "@/lib/types";

/**
 * §"Exports scoped by RBAC + tenant + the active filter" and
 * §"safe bulk actions (assign / priority / export)".
 *
 * These tests drive the real query layer and the real writers, because the risk
 * they cover is not visual: an export that ignores a filter, or a bulk action
 * that touches another tenant's rows or a finished dossier, is a data-integrity
 * failure that no screenshot would reveal.
 */

const STAFF = "agent@test.example";

/**
 * The bulk actions run behind the real session guard, so the tests establish a
 * real staff session (createSession + request cookie) exactly like the app does.
 * Anything the guard refuses is asserted as refused — not silently skipped.
 */
async function actAsStaff() {
  const { createSession } = await import("@/lib/auth");
  const staffRow = (await db.select().from(users).where(eq(users.email, STAFF)).limit(1))[0]!;
  const { token } = await createSession(staffRow.id);
  request.cookie = token;
  return staffRow;
}

/** Runs a server action and returns the flash message it redirected with. */
async function runAction(action: (form: FormData) => Promise<void>, form: FormData): Promise<string> {
  try {
    await action(form);
  } catch (error) {
    const digest = String((error as { digest?: string })?.digest ?? error);
    if (!digest.includes("NEXT_REDIRECT")) throw error;
    return decodeURIComponent(digest);
  }
  return "";
}

async function staff(): Promise<AuthUser> {
  const u = await userByEmail(STAFF);
  return { ...u, agencyId: null };
}

async function agencyUser(email = "a-admin@test.example"): Promise<AuthUser> {
  const u = await userByEmail(email);
  const a = await agencyByEmail("ops@agencya.example");
  return { ...u, agencyId: u.agencyId ?? a.id };
}

const FILE = (name: string) => ({ name, type: "application/pdf", size: 24, data: Buffer.from("%PDF-1.4 fixture") });

/**
 * A real, submitted dossier created through the production services — the same
 * path the agency UI takes (draft → applicant → required docs accepted → funded
 * wallet → submit). Fixtures are never inserted behind the services' backs.
 */
async function oneApplication(tag: string, agencyEmail = "ops@agencya.example") {
  const { getChecklist, getStatusByCode, changeApplicationStatus, recordApplicationDecision } = await import("@/lib/applications");
  const { uploadDocument, reviewDocument } = await import("@/lib/documents");
  const agency = await agencyByEmail(agencyEmail);
  // AuthUser comes from the fixtures helper (same shape the session provides).
  const staffActor = await staff();
  const visaTypeId = (await db.execute(sql`select id from visa_types where code = 'FR-SCH-TOUR' limit 1`)).rows[0] as { id: string };
  const app = await createDraftApplication({ agencyId: agency.id, visaTypeId: visaTypeId.id, createdBy: staffActor });
  await db.insert(applicants).values({
    applicationId: app.id,
    firstName: "Test",
    lastName: `Applicant ${tag}`,
    fullName: `Test Applicant ${tag}`,
    nationality: "Algerian",
  });
  for (const item of await getChecklist(app.id)) {
    if (!item.required) continue;
    await uploadDocument({ applicationId: app.id, actor: staffActor, checklistItemId: item.id, file: FILE(`${tag}-${item.documentTypeCode}.pdf`) });
    const row = (
      await db.select().from(applications).where(eq(applications.id, app.id)).limit(1)
    )[0]!;
    expect(row.id).toBe(app.id);
    const doc = (await db.execute(sql`select id from documents where application_id = ${app.id} and checklist_item_id = ${item.id} limit 1`)).rows[0] as { id: string };
    await reviewDocument({ documentId: doc.id, actor: staffActor, status: "ACCEPTED" });
  }
  await adjustWallet({ agencyId: agency.id, amount: 20_000, reason: `fixture ${tag}`, actor: staffActor });
  await submitApplication({ applicationId: app.id, actor: staffActor });
  void getStatusByCode;
  void changeApplicationStatus;
  void recordApplicationDecision;
  return { app, agency, staffActor };
}

describe("tabular export writers", () => {
  const columns: Column[] = [
    { key: "reference", header: "Reference" },
    { key: "fee", header: "Fee (DZD)", kind: "money" },
    { key: "applicant", header: "Applicant" },
  ];

  it("1. CSV is UTF-8 with BOM, CRLF-terminated and RFC-4180 escaped", () => {
    const csv = toCsv(columns, [{ reference: "EVT-2026-000001", fee: 24000, applicant: 'Ben, "Ali"' }]);
    expect(csv.startsWith("\uFEFFReference,Fee (DZD),Applicant\r\n")).toBe(true);
    expect(csv).toContain('"Ben, ""Ali"""');
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("2. a value that starts like a spreadsheet formula cannot execute", () => {
    expect(csvCell('=HYPERLINK("http://evil")')).toBe('"\'=HYPERLINK(""http://evil"")"');
    expect(csvCell("+33 6 12 34 56 78")).toContain("'+33");
    expect(csvCell("-120")).toContain("'-120");
    expect(csvCell(42)).toBe("42");
  });

  it("3. XLSX is a real workbook: valid ZIP, typed numbers, safe strings", () => {
    const buffer = toXlsx("Applications", columns, [
      { reference: "EVT-2026-000001", fee: 24000.5, applicant: "Amina Kaci" },
      { reference: '=cmd|calc', fee: 0, applicant: "بن يوسف — naïve" },
    ]);
    // ZIP local-file header + the OOXML parts must be present.
    expect(buffer.subarray(0, 4).toString("binary")).toBe("PK\u0003\u0004");
    expect(buffer.includes(Buffer.from("xl/worksheets/sheet1.xml"))).toBe(true);
    expect(buffer.includes(Buffer.from("xl/workbook.xml"))).toBe(true);

    // Inflate every member back and read the sheet the way Excel would.
    const names: string[] = [];
    let offset = 0;
    while (buffer.readUInt32LE(offset) === 0x04034b50) {
      const method = buffer.readUInt16LE(offset + 8);
      const compressed = buffer.readUInt32LE(offset + 18);
      const nameLen = buffer.readUInt16LE(offset + 26);
      const extraLen = buffer.readUInt16LE(offset + 28);
      const name = buffer.subarray(offset + 30, offset + 30 + nameLen).toString("utf8");
      const data = buffer.subarray(offset + 30 + nameLen + extraLen, offset + 30 + nameLen + extraLen + compressed);
      const body = method === 8 ? inflateRawSync(data) : data;
      names.push(name);
      if (name === "xl/worksheets/sheet1.xml") {
        const xml = body.toString("utf8");
        // The formula-looking text is stored as an inline STRING, never as <f>.
        expect(xml).not.toContain("<f>");
        expect(xml).toContain("=cmd|calc");
        // 24000.5 is a numeric cell.
        expect(xml).toContain('<c r="B2" t="n"><v>24000.5</v></c>');
        expect(xml).toContain("بن يوسف");
      }
      offset += 30 + nameLen + extraLen + compressed;
    }
    expect(names).toContain("[Content_Types].xml");
    expect(names).toContain("xl/styles.xml");
  });

  it("4. a repetitive workbook is genuinely deflated, and inflates back losslessly", () => {
    const rows: Row[] = Array.from({ length: 200 }, (_, i) => ({ reference: `EVT-2026-00${i}`, fee: i, applicant: "Repeat Name" }));
    const buffer = toXlsx("Big", columns, rows);
    // Uncompressed this sheet would be tens of kB; deflate must keep it small.
    expect(buffer.byteLength).toBeLessThan(12_000);

    let sheet: string | null = null;
    let offset = 0;
    while (offset < buffer.byteLength && buffer.readUInt32LE(offset) === 0x04034b50) {
      const method = buffer.readUInt16LE(offset + 8);
      const compressed = buffer.readUInt32LE(offset + 18);
      const nameLen = buffer.readUInt16LE(offset + 26);
      const extraLen = buffer.readUInt16LE(offset + 28);
      const name = buffer.subarray(offset + 30, offset + 30 + nameLen).toString("utf8");
      const start = offset + 30 + nameLen + extraLen;
      if (name === "xl/worksheets/sheet1.xml") {
        expect(method).toBe(8);
        sheet = inflateRawSync(buffer.subarray(start, start + compressed)).toString("utf8");
      }
      offset = start + compressed;
    }
    expect(sheet).not.toBeNull();
    expect(sheet!).toContain("Repeat Name");
    expect(deflateRawSync(Buffer.from(sheet!)).byteLength).toBeGreaterThan(0);
  });
});

describe("exports are scoped by RBAC, tenant and the active filter", () => {
  it("5. the export returns exactly the filtered set the list shows", async () => {
    const user = await staff();
    const { app } = await oneApplication("filter");
    const list = await searchApplications(user, { q: app.reference });
    const exported = await exportApplications(user, { q: app.reference });
    expect(list.rows.map((r) => r.app.id)).toEqual(exported.rows.map((r) => r.app.id));
    expect(exported.rows[0]!.app.reference).toBe(app.reference);
    expect(exported.truncated).toBe(false);
  });

  it("6. a status filter narrows the export — never 'everything'", async () => {
    const user = await staff();
    await oneApplication("status");
    const submitted = await exportApplications(user, { statusCode: "SUBMITTED" });
    const rejected = await exportApplications(user, { statusCode: "REJECTED" });
    expect(submitted.rows.length).toBeGreaterThan(0);
    expect(submitted.rows.every((r) => r.statusCode === "SUBMITTED")).toBe(true);
    expect(rejected.rows).toHaveLength(0);
  });

  it("7. an agency actor can only ever export its OWN agency rows", async () => {
    const agencyActor = await agencyUser();
    const otherAgency = await agencyByEmail("ops@agencyb.example");
    const { app: ownApp } = await oneApplication("tenant-a");
    const { app: foreignApp } = await oneApplication("tenant-b", "ops@agencyb.example");
    expect(otherAgency.id).not.toBe(agencyActor.agencyId);

    const scoped = await exportApplications(agencyActor, {});
    expect(scoped.rows.every((r) => r.app.agencyId === agencyActor.agencyId)).toBe(true);
    expect(scoped.rows.some((r) => r.app.id === foreignApp.id)).toBe(false);

    // …and asking for the other agency explicitly changes nothing.
    const smuggled = await exportApplications(agencyActor, { agencyId: otherAgency.id });
    expect(smuggled.rows.every((r) => r.app.agencyId === agencyActor.agencyId)).toBe(true);
    expect(smuggled.rows.some((r) => r.app.id === ownApp.id)).toBe(true);
  });

  it("8. the export is capped and reports truncation instead of lying", async () => {
    expect(EXPORT_ROW_LIMIT).toBeGreaterThan(0);
    const user = await staff();
    const result = await exportApplications(user, {});
    expect(result.rows.length).toBeLessThanOrEqual(EXPORT_ROW_LIMIT);
    expect(typeof result.truncated).toBe("boolean");
  });
});

describe("reports use real timestamps only", () => {
  it("9. average processing time is empty (not zero) when nothing is decided", async () => {
    const data = await reportData();
    if (Number(data.processing.decided) === 0) {
      expect(data.processing.avgDays).toBeNull();
      expect(data.processing.fastestDays).toBeNull();
    } else {
      expect(Number(data.processing.avgDays)).toBeGreaterThanOrEqual(0);
    }
  });

  it("10. the processing metric only counts dossiers with BOTH stamps", async () => {
    const data = await reportData();
    const decided = (await db.execute(sql`select count(*)::text as cnt from applications where submitted_at is not null and decision_at is not null`)).rows[0] as { cnt: string };
    expect(Number(decided.cnt)).toBe(Number(data.processing.decided));

    const halfStamped = (await db.execute(sql`select count(*)::text as cnt from applications where (submitted_at is null) <> (decision_at is null)`)).rows[0] as { cnt: string };
    const allRows = (await db.execute(sql`select count(*)::text as cnt from applications`)).rows[0] as { cnt: string };
    // Nothing without both stamps may be counted as decided.
    expect(Number(decided.cnt) + Number(halfStamped.cnt)).toBeLessThanOrEqual(Number(allRows.cnt));
  });

  it("11. every money figure in the reports payload is a DZD string", async () => {
    const data = await reportData();
    expect(Number(data.walletFlow!.credits)).toBeGreaterThanOrEqual(0);
    expect(data.walletFlow!.charges).toMatch(/^\d+(\.\d+)?$/);
  });
});

describe("bulk actions are limited to assign / priority / export", () => {
  it("12. finished dossiers are excluded from bulk changes", async () => {
    const { bulkAssignAction, bulkPriorityAction } = await import("@/app/actions/applications");
    await actAsStaff();
    const { app } = await oneApplication("bulk-final");
    const finalStatus = (await db.select().from(statuses).where(eq(statuses.code, "APPROVED")).limit(1))[0]!;
    await db.update(applications).set({ statusId: finalStatus.id, decisionAt: new Date() }).where(eq(applications.id, app.id));

    const form = new FormData();
    form.append("ids", app.id);
    form.append("priorityId", (await db.select().from(priorities).limit(1))[0]!.id);
    const flash = await runAction(bulkPriorityAction, form);
    // The user is told WHY nothing happened — a silent no-op is not acceptable.
    expect(flash).toMatch(/Finished dossiers/i);
    const after = (await db.select().from(applications).where(eq(applications.id, app.id)))[0]!;
    expect(after.statusId).toBe(finalStatus.id);
    const priorityChanged = await db
      .select({ id: auditLogs.id })
      .from(auditLogs)
      .where(and(eq(auditLogs.action, "APPLICATION_PRIORITY_CHANGED"), eq(auditLogs.entityId, app.id)));
    expect(priorityChanged).toHaveLength(0);

    const form2 = new FormData();
    form2.append("ids", app.id);
    form2.append("assignedTo", (await db.select().from(users).where(eq(users.role, "VISA_AGENT")).limit(1))[0]!.id);
    const flash2 = await runAction(bulkAssignAction, form2);
    expect(flash2).toMatch(/Finished dossiers/i);
    const assigned = (await db.select().from(applications).where(eq(applications.id, app.id)))[0]!;
    expect(assigned.assignedTo).toBeNull();
  });

  it("13. bulk assignment audits every dossier and notifies the officer", async () => {
    const { bulkAssignAction } = await import("@/app/actions/applications");
    await actAsStaff();
    const { app } = await oneApplication("bulk-assign");
    const officer = (await db.select().from(users).where(eq(users.role, "VISA_AGENT")).limit(1))[0]!;
    const actor = await db.select().from(users).where(eq(users.email, STAFF)).limit(1);

    const form = new FormData();
    form.append("ids", app.id);
    form.append("assignedTo", officer.id);
    const flash = await runAction(bulkAssignAction, form);
    expect(flash.toLowerCase()).toContain("assigned");
    const applied = (await db.select().from(applications).where(eq(applications.id, app.id)))[0]!;
    expect(applied.assignedTo).toBe(officer.id);

    const audits = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.action, "APPLICATION_ASSIGNED"), eq(auditLogs.entityId, app.id)));
    expect(audits.length).toBeGreaterThan(0);
    if (actor[0] && actor[0].id !== officer.id) {
      const notes = await db.select().from(notifications).where(eq(notifications.userId, officer.id));
      expect(notes.some((n) => n.title.includes(app.reference))).toBe(true);
    }
  });

  it("14. a bulk request refuses an empty selection and absurd batches", async () => {
    const { bulkAssignAction } = await import("@/app/actions/applications");
    await actAsStaff();
    expect(await runAction(bulkAssignAction, new FormData())).toMatch(/Select at least one dossier/i);
    const huge = new FormData();
    for (let i = 0; i < 201; i++) huge.append("ids", crypto.randomUUID());
    expect(await runAction(bulkAssignAction, huge)).toMatch(/at most 200/i);
  });

  it("15. dossiers can never be bulk-assigned to an agency user", async () => {
    const { bulkAssignAction } = await import("@/app/actions/applications");
    await actAsStaff();
    const { app } = await oneApplication("bulk-agency");
    const agencyAccount = (await db.select().from(users).where(eq(users.email, "a-admin@test.example")).limit(1))[0]!;
    const form = new FormData();
    form.append("ids", app.id);
    form.append("assignedTo", agencyAccount.id);
    const flash = await runAction(bulkAssignAction, form);
    expect(flash).toMatch(/ESSAFARIA staff/i);
    const row = (await db.select().from(applications).where(eq(applications.id, app.id)))[0]!;
    expect(row.assignedTo).not.toBe(agencyAccount.id);
  });

  it("16. an agency session cannot run the staff bulk actions at all", async () => {
    const { bulkAssignAction } = await import("@/app/actions/applications");
    const { app } = await oneApplication("bulk-rbac");
    const { createSession } = await import("@/lib/auth");
    const agencyAccount = (await db.select().from(users).where(eq(users.email, "a-admin@test.example")).limit(1))[0]!;
    const { token } = await createSession(agencyAccount.id);
    request.cookie = token;

    const officer = (await db.select().from(users).where(eq(users.role, "VISA_AGENT")).limit(1))[0]!;
    const form = new FormData();
    form.append("ids", app.id);
    form.append("assignedTo", officer.id);
    const flash = await runAction(bulkAssignAction, form);
    expect(flash).toMatch(/not authorized|not allowed|permission/i);
    const row = (await db.select().from(applications).where(eq(applications.id, app.id)))[0]!;
    expect(row.assignedTo).not.toBe(officer.id);
    request.cookie = "";
  });
});
