import { describe, expect, it } from "vitest";
import { suiteSetup } from "./helpers/global-state";

suiteSetup();

import { db } from "@/lib/db";
import {
  applicants as applicantsTb,
  applicationStatusHistory,
  applications,
  auditLogs,
  checklistItems,
  notifications,
  walletTransactions,
} from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import {
  allowedNextStatuses,
  changeApplicationStatus,
  createDraftApplication,
  recordApplicationDecision,
  submitApplication,
} from "@/lib/applications";
import { uploadDocument } from "@/lib/documents";
import { adjustWallet } from "@/lib/wallet";
import { userByEmail, agencyByEmail } from "./helpers/fixtures";

async function visaId() {
  return ((await db.execute(sql`select id from visa_types where code='JP-BUS'`)).rows[0] as { id: string }).id;
}

async function submittedApp() {
  const agency = await agencyByEmail("ops@agencyb.example");
  const staffB = await userByEmail("b-admin@test.example");
  const superAdmin = await userByEmail("superadmin@test.example");
  await adjustWallet({ agencyId: agency.id, amount: 500, reason: "status flow funding", actor: superAdmin });
  const app = await createDraftApplication({ agencyId: agency.id, visaTypeId: await visaId(), createdBy: staffB });
  await db.insert(applicantsTb).values({
    applicationId: app.id,
    firstName: "Status",
    lastName: "Flow",
    dateOfBirth: "1991-02-02",
    nationality: "Japanese",
    passportNumber: "JP7776665",
    passportExpiryDate: "2033-01-01",
  });
  const required = await db
    .select()
    .from(checklistItems)
    .where(sql`${checklistItems.applicationId} = ${app.id} and ${checklistItems.required} = true`);
  for (const item of required) {
    await uploadDocument({
      applicationId: app.id,
      actor: staffB,
      file: { name: `${item.documentTypeCode}.pdf`, type: "application/pdf", size: 512, data: Buffer.from("d") },
      checklistItemId: item.id,
    });
  }
  const { reference } = await submitApplication({ applicationId: app.id, actor: staffB });
  return { app, reference, agency, staffB };
}

describe("application status workflow", () => {
  it("agency cannot perform staff-only transitions", async () => {
    const { app, staffB } = await submittedApp();
    await expect(
      changeApplicationStatus({ applicationId: app.id, toStatusCode: "UNDER_REVIEW", actor: staffB }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("invalid transitions are rejected", async () => {
    const { app } = await submittedApp();
    const agent = await userByEmailSafe("agent@test.example");
    // SUBMITTED → EMBASSY_SUBMISSION is not a configured transition
    await expect(
      changeApplicationStatus({ applicationId: app.id, toStatusCode: "EMBASSY_SUBMISSION", actor: agent }),
    ).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  });

  it("staff transition SUBMITTED → UNDER_REVIEW writes history, audit and agency notifications", async () => {
    const { app, agency } = await submittedApp();
    const agent = await userByEmailSafe("agent@test.example");

    const before = (await db.select().from(applications).where(eq(applications.id, app.id)))[0]!;
    await changeApplicationStatus({
      applicationId: app.id,
      toStatusCode: "UNDER_REVIEW",
      reason: "Documents verified",
      actor: agent,
    });
    const after = (await db.select().from(applications).where(eq(applications.id, app.id)))[0]!;
    expect(after.statusId).not.toBe(before.statusId);

    const history = await db
      .select()
      .from(applicationStatusHistory)
      .where(eq(applicationStatusHistory.applicationId, app.id));
    expect(history.length).toBe(2); // submitted + under review
    expect(history.some((h) => h.reason === "Documents verified")).toBe(true);

    const agencyNotifs = await db
      .select()
      .from(notifications)
      .where(sql`${notifications.applicationId} = ${app.id} and ${notifications.agencyId} = ${agency.id} and ${notifications.type} = 'STATUS_CHANGED'`);
    expect(agencyNotifs.length).toBeGreaterThan(0);

    const audits = await db
      .select()
      .from(auditLogs)
      .where(sql`${auditLogs.entityId} = ${app.id} and ${auditLogs.action} = 'STATUS_CHANGED'`);
    expect(audits.length).toBeGreaterThan(0);
  });

  it("full lifecycle to COMPLETED", async () => {
    const { app } = await submittedApp();
    const agent = await userByEmailSafe("agent@test.example");
    // PHASE 2.1: APPROVED is only reachable through the decision workflow
    for (const code of ["UNDER_REVIEW", "PROCESSING", "EMBASSY_SUBMISSION", "AWAITING_DECISION"]) {
      await changeApplicationStatus({ applicationId: app.id, toStatusCode: code, actor: agent });
    }
    await recordApplicationDecision({
      applicationId: app.id,
      outcome: "APPROVED",
      actor: agent,
      file: { name: "visa.pdf", type: "application/pdf", size: 68, data: Buffer.from("%PDF-1.5 visa copy issued by embassy") },
    });
    await changeApplicationStatus({ applicationId: app.id, toStatusCode: "COMPLETED", actor: agent });
    const final = (await db.select().from(applications).where(eq(applications.id, app.id)))[0]!;
    expect(final.completedAt).not.toBeNull();
    expect(final.decisionAt).not.toBeNull();
    const history = await db
      .select()
      .from(applicationStatusHistory)
      .where(eq(applicationStatusHistory.applicationId, app.id));
    expect(history.length).toBe(7); // submitted + 6 transitions
  });

  it("agency-visible cancellation path exists from DRAFT only for agency roles", async () => {
    const agency = await agencyByEmail("ops@agencyb.example");
    const staffB = await userByEmail("b-admin@test.example");
    const draft = await createDraftApplication({ agencyId: agency.id, visaTypeId: await visaId(), createdBy: staffB });
    const next = await allowedNextStatuses(draft.statusId, staffB.role);
    expect(next.map((n) => n.status.code)).toContain("CANCELLED");

    await changeApplicationStatus({
      applicationId: draft.id,
      toStatusCode: "CANCELLED",
      reason: "Client cancelled",
      actor: staffB,
    });
    const row = (await db.select().from(applications).where(eq(applications.id, draft.id)))[0]!;
    expect(row.statusId).not.toBe(draft.statusId);
    // cancelled drafts must never be charged
    const charges = await db.select().from(walletTransactions).where(eq(walletTransactions.applicationId, draft.id));
    expect(charges.length).toBe(0);
  });
});

async function userByEmailSafe(email: string) {
  const mod = await import("./helpers/fixtures");
  return mod.userByEmail(email);
}
