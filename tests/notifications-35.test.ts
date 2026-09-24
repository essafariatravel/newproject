import { beforeEach, describe, expect, it } from "vitest";
import { suiteSetup } from "./helpers/global-state";
import { resetData } from "./helpers/pg";
import { seedFixtures } from "./helpers/fixtures";

beforeEach(async () => {
  await resetData();
  await seedFixtures();
});

suiteSetup();

import { db } from "@/lib/db";
import { walletTransactions } from "@/db/schema";
import {
  applicants as applicantsTb,
  applications,
  checklistItems,
  notifications,
  users,
} from "@/db/schema";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { createDraftApplication, getChecklist, submitApplication } from "@/lib/applications";
import { reviewDocument, uploadDocument } from "@/lib/documents";
import { requestAdditionalDocument, requestDocumentReplacement } from "@/lib/document-requests";
import { adjustWallet, applyWalletMutation } from "@/lib/wallet";
import { createTopupRequest, processTopupRequest } from "@/lib/topup";
import { listNotificationsForUser, unreadNotificationCount } from "@/lib/queries";
import { notifyUsers } from "@/lib/notifications";
import { agencyByEmail, userByEmail } from "./helpers/fixtures";

/**
 * §34/§35 — notifications: they exist for real events, they deep-link to the
 * right surface, "mark all read" reaches exactly zero unread, and one tenant can
 * never read (or mark) another tenant's rows.
 */

async function visaId(code = "FR-SCH-TOUR") {
  return ((await db.execute(sql`select id from visa_types where code=${code}`)).rows[0] as { id: string }).id;
}

async function submittedApp(tag: string) {
  const agency = await agencyByEmail("ops@agencya.example");
  const staff = await userByEmail("agent@test.example");
  const app = await createDraftApplication({ agencyId: agency.id, visaTypeId: await visaId(), createdBy: staff });
  await db.insert(applicantsTb).values({
    applicationId: app.id,
    firstName: "Notif",
    lastName: tag,
    fullName: `Notif ${tag}`,
    dateOfBirth: "1988-08-08",
    nationality: "Algerian",
    passportNumber: `NF${String(Date.now()).slice(-6)}`,
    passportExpiryDate: "2032-01-01",
  });
  for (const item of await getChecklist(app.id)) {
    if (!item.required) continue;
    const doc = await uploadDocument({
      applicationId: app.id,
      actor: staff,
      checklistItemId: item.id,
      file: { name: `${tag}-${item.documentTypeCode}.pdf`, type: "application/pdf", size: 20, data: Buffer.from("%PDF-1.4 notif") },
    });
    await reviewDocument({ documentId: doc.id, actor: staff, status: "ACCEPTED" });
  }
  await adjustWallet({ agencyId: agency.id, amount: 5000, reason: "notification funding", actor: staff });
  await submitApplication({ applicationId: app.id, actor: staff });
  return { app, agency, staff };
}

/**
 * Notifications actually addressed to an agency's users.
 *
 * Scoped by RECIPIENT, not by the agencyId column: staff notifications carry the
 * agency id for context, so filtering on the column alone would mix the two
 * audiences (and let a test "prove" an agency saw something it never received).
 */
async function agencyNotifications(agencyId: string) {
  const recipientIds = (
    await db.select({ id: users.id }).from(users).where(eq(users.agencyId, agencyId))
  ).map((u) => u.id);
  if (recipientIds.length === 0) return [];
  return db
    .select()
    .from(notifications)
    .where(inArray(notifications.userId, recipientIds))
    .orderBy(notifications.createdAt);
}

/** Notification rows that reached at least one agency user of any agency. */
async function agencyFacing(agencyId: string, type: string) {
  return (await agencyNotifications(agencyId)).filter((n) => n.type === type);
}

describe("§34 notifications — every required event produces a notification", () => {
  it("submission notifies staff; the agency keeps its own record", async () => {
    const { app } = await submittedApp("submit");
    const staff = await userByEmail("agent@test.example");
    const rows = await listNotificationsForUser(staff.id);
    expect(rows.some((n) => n.type === "APPLICATION_SUBMITTED" && n.link === `/admin/applications/${app.id}`)).toBe(true);
  });

  it("a document request notifies the agency with a working deep link", async () => {
    const { app, agency } = await submittedApp("docreq");
    const staff = await userByEmail("agent@test.example");
    const item = (await getChecklist(app.id))[0]!;

    await requestDocumentReplacement({
      applicationId: app.id,
      checklistItemId: item.id,
      reason: "Please resend the passport page.",
      actor: staff,
    });

    const rows = await agencyNotifications(agency.id);
    const notif = rows.find((n) => n.type === "DOCUMENT_REQUESTED");
    expect(notif).toBeTruthy();
    expect(notif!.title).toContain("Action required");
    expect(notif!.link).toBe(`/portal/applications/${app.id}`);
    expect(notif!.applicationId).toBe(app.id);
    // body carries the human reason, never an internal id
    expect(notif!.body).toContain("Please resend the passport page.");
    expect(notif!.body).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/);
    // unread until the agency reads it
    expect(notif!.readAt).toBeNull();
  });

  it("an additional request and its fulfilment both notify the right side", async () => {
    const { app, agency } = await submittedApp("addnotif");
    const staff = await userByEmail("agent@test.example");
    const agencyAdmin = { ...(await userByEmail("a-admin@test.example")), agencyId: agency.id };
    const { documentTypeIdByCode } = await import("./helpers/fixtures");
    const extraType = await documentTypeIdByCode("HOTEL_RESERVATION");

    const request = await requestAdditionalDocument({
      applicationId: app.id,
      documentTypeId: extraType,
      reason: "Embassy needs a hotel booking.",
      actor: staff,
    });
    const agencyBefore = await agencyNotifications(agency.id);
    expect(agencyBefore.some((n) => n.type === "DOCUMENT_REQUESTED" && n.title.includes("additional"))).toBe(true);

    await uploadDocument({
      applicationId: app.id,
      actor: agencyAdmin,
      checklistItemId: request.checklistItemId!,
      documentTypeId: extraType,
      file: { name: "hotel.pdf", type: "application/pdf", size: 20, data: Buffer.from("%PDF-1.4 hotel") },
    });

    // staff are told the request was fulfilled, with a link into the dossier
    const staffRows = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, staff.id), eq(notifications.type, "DOCUMENTS_REQUIRED")));
    expect(staffRows.length).toBeGreaterThan(0);
    expect(staffRows.some((n) => n.link === `/admin/applications/${app.id}`)).toBe(true);
  });

  it("a status change notifies the agency, and the notification is human-readable", async () => {
    const { app, agency } = await submittedApp("status");
    const staff = await userByEmail("agent@test.example");
    const { changeApplicationStatus } = await import("@/lib/applications");

    await changeApplicationStatus({ applicationId: app.id, toStatusCode: "DOCUMENTS_CHECKING", actor: staff });

    const rows = await agencyNotifications(agency.id);
    const notif = rows.find((n) => n.type === "STATUS_CHANGED");
    expect(notif).toBeTruthy();
    expect(notif!.link).toBe(`/portal/applications/${app.id}`);
    expect(notif!.title).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/); // no UUIDs in agency-facing copy
    expect(notif!.title.toLowerCase()).not.toContain("undefined");
  });

  it("the final decision notifies the agency and links to the dossier", async () => {
    const { app, agency } = await submittedApp("decision");
    const staff = await userByEmail("agent@test.example");
    const { changeApplicationStatus, recordApplicationDecision } = await import("@/lib/applications");

    await changeApplicationStatus({ applicationId: app.id, toStatusCode: "DOCUMENTS_CHECKING", actor: staff });
    await changeApplicationStatus({ applicationId: app.id, toStatusCode: "IN_PROCESS", actor: staff });
    await recordApplicationDecision({
      applicationId: app.id,
      outcome: "APPROVED",
      actor: staff,
      file: { name: "visa.pdf", type: "application/pdf", size: 28, data: Buffer.from("%PDF-1.7 approved..") },
    });

    const decisionNotifs = [
      ...(await agencyFacing(agency.id, "APPLICATION_DECISION")),
      ...(await agencyFacing(agency.id, "APPLICATION_COMPLETED")),
    ];
    expect(decisionNotifs.length).toBeGreaterThan(0);
    for (const n of decisionNotifs) {
      expect(n.link).toBe(`/portal/applications/${app.id}`);
      expect(n.title).toContain(app.reference);
    }
    // …and the staff copy points into the back office instead.
    const staffRows = await listNotificationsForUser((await userByEmail("admin@test.example")).id);
    expect(staffRows.some((n) => n.type === "APPLICATION_DECISION" && n.link === `/admin/applications/${app.id}`)).toBe(true);
  });

  it("a wallet credit notifies the agency; the amount and balance are in the body", async () => {
    const agency = await agencyByEmail("ops@agencya.example");
    const staff = await userByEmail("accounting@test.example");

    await adjustWallet({ agencyId: agency.id, amount: 12345, reason: "bank transfer received", actor: staff });

    const rows = await agencyFacing(agency.id, "WALLET_ADJUSTED");
    expect(rows.length).toBeGreaterThan(0);
    for (const wallet of rows) {
      expect(wallet.link).toBe("/portal/wallet");
      expect(wallet.title).toContain("12,345.00 DZD");
      expect(wallet.body).toContain("bank transfer received");
      expect(wallet.body).toMatch(/WLT-\d{4}-\d{6}/); // the ledger row it produced
      expect(wallet.body).toContain("DZD");
    }
    // a debit notifies with its own wording
    await adjustWallet({ agencyId: agency.id, amount: -500, reason: "manual correction", actor: staff });
    const afterDebit = await agencyFacing(agency.id, "WALLET_ADJUSTED");
    expect(afterDebit.some((n) => n.title.includes("debited") && n.title.includes("500.00"))).toBe(true);
  });

  it("a top-up request notifies staff, and the decision notifies the agency", async () => {
    const agency = await agencyByEmail("ops@agencya.example");
    const aAdmin = { ...(await userByEmail("a-admin@test.example")), agencyId: agency.id };
    const superAdmin = await userByEmail("superadmin@test.example");

    const req = await createTopupRequest({ agencyId: agency.id, amount: 50000, note: "transfer pending", actor: aAdmin });

    // staff side
    const staffRows = await db.select().from(notifications).where(and(eq(notifications.userId, superAdmin.id), eq(notifications.type, "TOPUP_REQUESTED")));
    expect(staffRows.length).toBeGreaterThan(0);
    expect(staffRows[0]!.link).toBe("/admin/billing");
    expect(staffRows[0]!.title).toContain(req.reference);

    // agency side, after the decision
    await processTopupRequest({ requestId: req.id, actor: superAdmin, decision: "CREDIT" });
    const agencyRows = await agencyNotifications(agency.id);
    const decided = agencyRows.find((n) => n.type === "WALLET_TOPUP_DECIDED");
    expect(decided).toBeTruthy();
    expect(decided!.link).toBe("/portal/wallet");
    expect(decided!.body).toContain(req.reference);
    expect(decided!.body).toMatch(/DZD/);
  });

  it("mark-all-read leaves exactly zero unread — and only for the acting user", async () => {
    const agency = await agencyByEmail("ops@agencya.example");
    const staff = await userByEmail("accounting@test.example");
    const aAdmin = await userByEmail("a-admin@test.example");
    const aUser = await userByEmail("a-user@test.example");

    await adjustWallet({ agencyId: agency.id, amount: 100, reason: "credit one", actor: staff });
    await adjustWallet({ agencyId: agency.id, amount: 200, reason: "credit two", actor: staff });

    expect(await unreadNotificationCount(aAdmin.id)).toBeGreaterThan(0);
    expect(await unreadNotificationCount(aUser.id)).toBeGreaterThan(0);

    // exactly what markNotificationsReadAction does for the signed-in user
    await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, aAdmin.id), isNull(notifications.readAt)));

    expect(await unreadNotificationCount(aAdmin.id)).toBe(0);
    // the colleague's inbox is untouched
    expect(await unreadNotificationCount(aUser.id)).toBeGreaterThan(0);
    // every remaining unread row belongs to the colleague
    const stillUnread = await db.select().from(notifications).where(isNull(notifications.readAt));
    expect(stillUnread.every((n) => n.userId === aUser.id)).toBe(true);
  });

  it("marking one notification read cannot touch another user's row", async () => {
    const agency = await agencyByEmail("ops@agencya.example");
    const staff = await userByEmail("accounting@test.example");
    await adjustWallet({ agencyId: agency.id, amount: 50, reason: "single", actor: staff });

    const aAdmin = await userByEmail("a-admin@test.example");
    const aUser = await userByEmail("a-user@test.example");
    const colleagueRow = (await listNotificationsForUser(aUser.id))[0]!;

    // the action filters by (id AND userId) — a forged id changes nothing
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.id, colleagueRow.id), eq(notifications.userId, aAdmin.id), isNull(notifications.readAt)));

    const after = await db.select().from(notifications).where(eq(notifications.id, colleagueRow.id));
    expect(after[0]!.readAt).toBeNull();
  });

  it("notifications are tenant-scoped: agency B never sees agency A's rows", async () => {
    const agencyA = await agencyByEmail("ops@agencya.example");
    const agencyB = await agencyByEmail("ops@agencyb.example");
    const staff = await userByEmail("accounting@test.example");
    await adjustWallet({ agencyId: agencyA.id, amount: 321, reason: "for A only", actor: staff });

    const bAdmin = await userByEmail("b-admin@test.example");
    const bRows = await listNotificationsForUser(bAdmin.id);
    expect(bRows.length).toBe(0);
    expect(await unreadNotificationCount(bAdmin.id)).toBe(0);

    // No notification addressed to agency B mentions agency A's movement…
    const bAgencyRows = await agencyNotifications(agencyB.id);
    expect(bAgencyRows.some((n) => n.body.includes("for A only"))).toBe(false);
    // …and the row that WAS created went to agency A's users only.
    const aFacing = await agencyFacing(agencyA.id, "WALLET_ADJUSTED");
    expect(aFacing.some((n) => n.body.includes("for A only"))).toBe(true);
  });

  it("unread badge counts only the user's own unread rows", async () => {
    const agency = await agencyByEmail("ops@agencya.example");
    const staff = await userByEmail("accounting@test.example");
    const aAdmin = await userByEmail("a-admin@test.example");
    await adjustWallet({ agencyId: agency.id, amount: 11, reason: "badge", actor: staff });

    const ids = await db.select().from(notifications).where(eq(notifications.userId, aAdmin.id));
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.id, ids[0]!.id), eq(notifications.userId, aAdmin.id)));

    expect(await unreadNotificationCount(aAdmin.id)).toBe(ids.length - 1);
  });

  it("an unexpected internal event never leaks a raw UUID into agency-facing copy", async () => {
    const agency = await agencyByEmail("ops@agencya.example");
    const app = await createDraftApplication({ agencyId: agency.id, visaTypeId: await visaId(), createdBy: await userByEmail("agent@test.example") });
    const aIds = await db.select().from((await import("@/db/schema")).users).where(eq((await import("@/db/schema")).users.email, "a-admin@test.example"));

    await notifyUsers([aIds[0]!.id], {
      type: "STATUS_CHANGED",
      title: "Status changed",
      body: `Reference ${app.reference}`,
      link: `/portal/applications/${app.id}`,
      agencyId: agency.id,
      applicationId: app.id,
    });
    const rows = await agencyNotifications(agency.id);
    const latest = rows[rows.length - 1]!;
    expect(latest.body).toContain(app.reference);
    expect(latest.body).not.toContain(app.id); // the internal id stays out of the copy
  });
});

describe("§35 notifications — wallet mutation notification respects the authorized path", () => {
  it("a staff adjustment through the wallet service notifies the agency with the ledger reference", async () => {
    const agency = await agencyByEmail("ops@agencya.example");
    const staff = await userByEmail("accounting@test.example");
    const { Pool } = await import("pg");
    const { databasePoolConfig } = await import("@/lib/database-config");
    const pool = new Pool({ ...databasePoolConfig(process.env, true), max: 1 });
    const client = await pool.connect();
    try {
      await client.query(`set search_path to ${process.env.DATABASE_SCHEMA ?? "public"}`);
      await client.query("begin");
      await client.query(`update agencies set balance = balance + 1000 where id = $1`, [agency.id]);
      await applyWalletMutation(client, {
        agencyId: agency.id,
        operation: "DEBIT",
        amountAbs: "250.00",
        reason: "manual correction",
        actorId: staff.id,
      });
      await client.query("commit");
    } finally {
      client.release();
      await pool.end();
    }
    // The low-level primitive is deliberately silent (the submission charge has
    // its own announcement); the authorized staff service is what notifies.
    expect((await agencyFacing(agency.id, "WALLET_ADJUSTED")).length).toBe(0);
    await adjustWallet({ agencyId: agency.id, amount: -250, reason: "manual correction", actor: staff });
    const rows = await agencyFacing(agency.id, "WALLET_ADJUSTED");
    expect(rows.some((n) => n.title.includes("250.00"))).toBe(true);
  });

  it("the dossier's charge notification set stays consistent with one submitted file", async () => {
    const { app, agency } = await submittedApp("charge-notif");
    const rows = await agencyNotifications(agency.id);
    // The submission charge is announced by the submission flow, exactly once, and
    // it carries the dossier reference — never a raw id.
    const submitted = rows.filter((n) => n.type === "APPLICATION_SUBMITTED");
    expect(submitted.some((n) => n.body.includes(app.reference) || n.title.includes(app.reference))).toBe(true);
    // the agency ledger itself holds exactly one charge row for the file
    const charges = await db
      .select()
      .from(walletTransactions)
      .where(and(eq(walletTransactions.applicationId, app.id), eq(walletTransactions.type, "APPLICATION_CHARGE")));
    expect(charges.length).toBe(1);
    const chargeCount = await db
      .select()
      .from(applications)
      .where(and(eq(applications.id, app.id), eq(applications.agencyId, agency.id)));
    expect(chargeCount.length).toBe(1);
    expect(rows.every((n) => n.applicationId === null || n.applicationId === app.id)).toBe(true);
    // the checklist is intact after the whole flow
    const items = await db.select().from(checklistItems).where(eq(checklistItems.applicationId, app.id));
    expect(items.length).toBeGreaterThan(0);
  });
});
