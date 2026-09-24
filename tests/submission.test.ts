import { describe, expect, it } from "vitest";
import { suiteSetup } from "./helpers/global-state";

suiteSetup();

import { db } from "@/lib/db";
import {
  agencies,
  applicants as applicantsTb,
  applications,
  auditLogs,
  checklistItems,
  notifications,
  walletTransactions,
} from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import {
  checklistProgress,
  createDraftApplication,
  getSubmissionGate,
  submitApplication,
  getStatusByCode,
} from "@/lib/applications";
import { uploadDocument } from "@/lib/documents";
import { adjustWallet } from "@/lib/wallet";
import { userByEmail, agencyByEmail } from "./helpers/fixtures";
import { AppError } from "@/lib/types";

async function visaId() {
  return ((await db.execute(sql`select id from visa_types where code='FR-SCH-TOUR'`)).rows[0] as { id: string }).id;
}

describe("application creation & snapshots", () => {
  it("snapshots fee, currency, processing time and names at creation", async () => {
    const agencyA = await agencyByEmail("ops@agencya.example");
    const staffA = await userByEmail("a-admin@test.example");
    const app = await createDraftApplication({ agencyId: agencyA.id, visaTypeId: await visaId(), createdBy: staffA });
    expect(app.reference).toMatch(/^EVT-\d{2}-[A-Z2-9]{8}$/);
    expect(app.fee).toBe("120.00");
    expect(app.currency).toBe("DZD");
    expect(app.processingMinDays).toBe(10);
    expect(app.processingMaxDays).toBe(25);
    expect(app.visaTypeName).toBe("France Schengen Tourist");
    expect(app.countryName).toBe("France");
  });

  it("generates the checklist from configured requirements (3 required, 1 optional)", async () => {
    const agencyA = await agencyByEmail("ops@agencya.example");
    const staffA = await userByEmail("a-admin@test.example");
    const app = await createDraftApplication({ agencyId: agencyA.id, visaTypeId: await visaId(), createdBy: staffA });
    const items = await db.select().from(checklistItems).where(eq(checklistItems.applicationId, app.id));
    expect(items.length).toBe(4);
    expect(items.filter((i) => i.required).length).toBe(3);
    const progress = await checklistProgress(app.id);
    expect(progress.requiredTotal).toBe(3);
    expect(progress.requiredComplete).toBe(0);
  });
});

describe("submission gate & charging", () => {
  it("full flow: gate → upload → submit → single wallet charge → notifications", async () => {
    const agencyA = await agencyByEmail("ops@agencya.example");
    const staffA = await userByEmail("a-admin@test.example");
    const superAdmin = await userByEmail("superadmin@test.example");

    await adjustWallet({ agencyId: agencyA.id, amount: 1000, reason: "submission flow funding", actor: superAdmin });

    const app = await createDraftApplication({ agencyId: agencyA.id, visaTypeId: await visaId(), createdBy: staffA });
    await db.insert(applicantsTb).values({
      applicationId: app.id,
      firstName: "Omar",
      lastName: "Tazi",
      dateOfBirth: "1988-05-05",
      nationality: "Moroccan",
      passportNumber: "AB9988776",
      passportExpiryDate: "2031-01-01",
    });

    // gate blocks
    const gateBefore = await getSubmissionGate(app.id);
    expect(gateBefore.ok).toBe(false);
    await expect(submitApplication({ applicationId: app.id, actor: staffA })).rejects.toMatchObject({
      code: "CHECKLIST_INCOMPLETE",
    });

    // upload all required docs
    const required = await db
      .select()
      .from(checklistItems)
      .where(sql`${checklistItems.applicationId} = ${app.id} and ${checklistItems.required} = true`);
    for (const item of required) {
      await uploadDocument({
        applicationId: app.id,
        actor: staffA,
        file: { name: `${item.documentTypeCode}.pdf`, type: "application/pdf", size: 2048, data: Buffer.from("doc") },
        checklistItemId: item.id,
      });
    }
    const gateAfter = await getSubmissionGate(app.id);
    expect(gateAfter.ok).toBe(true);

    // submit & verify charge
    const result = await submitApplication({ applicationId: app.id, actor: staffA });
    expect(result.charge.balanceBefore).toBe("1000.00");
    expect(result.charge.balanceAfter).toBe("880.00");

    const charges = await db
      .select()
      .from(walletTransactions)
      .where(sql`${walletTransactions.applicationId} = ${app.id} and ${walletTransactions.type} = 'APPLICATION_CHARGE'`);
    expect(charges.length).toBe(1);

    // duplicate submission attempt → rejected, still exactly one charge
    await expect(submitApplication({ applicationId: app.id, actor: staffA })).rejects.toMatchObject({
      code: "ALREADY_SUBMITTED",
    });
    const chargesAfterRetry = await db
      .select()
      .from(walletTransactions)
      .where(sql`${walletTransactions.applicationId} = ${app.id} and ${walletTransactions.type} = 'APPLICATION_CHARGE'`);
    expect(chargesAfterRetry.length).toBe(1);

    const bal = (await db.select().from(agencies).where(eq(agencies.id, agencyA.id)))[0]!;
    expect(bal.balance).toBe("880.00");

    // notification + audit created
    const notifs = await db.select().from(notifications).where(eq(notifications.applicationId, app.id));
    expect(notifs.length).toBeGreaterThan(0);
    const audits = await db.select().from(auditLogs).where(sql`${auditLogs.entityId} = ${app.id} and ${auditLogs.action} = 'APPLICATION_SUBMITTED'`);
    expect(audits.length).toBe(1);
  });

  it("insufficient wallet blocks submission with no charge and no status flip", async () => {
    const agencyB = await agencyByEmail("ops@agencyb.example");
    const staffB = await userByEmail("b-admin@test.example");
    const app = await createDraftApplication({ agencyId: agencyB.id, visaTypeId: await visaId(), createdBy: staffB });
    await db.insert(applicantsTb).values({
      applicationId: app.id,
      firstName: "Ben",
      lastName: "Oak",
      dateOfBirth: "1980-03-03",
      nationality: "British",
      passportNumber: "GB1122334",
      passportExpiryDate: "2032-01-01",
    });
    const required = await db
      .select()
      .from(checklistItems)
      .where(sql`${checklistItems.applicationId} = ${app.id} and ${checklistItems.required} = true`);
    for (const item of required) {
      await uploadDocument({
        applicationId: app.id,
        actor: staffB,
        file: { name: `${item.documentTypeCode}.pdf`, type: "application/pdf", size: 1024, data: Buffer.from("doc") },
        checklistItemId: item.id,
      });
    }
    await expect(submitApplication({ applicationId: app.id, actor: staffB })).rejects.toMatchObject({
      code: "INSUFFICIENT_FUNDS",
    });
    const charges = await db.select().from(walletTransactions).where(eq(walletTransactions.applicationId, app.id));
    expect(charges.length).toBe(0);
    const draft = await getStatusByCode("DRAFT");
    const appRow = (await db.select().from(applications).where(eq(applications.id, app.id)))[0]!;
    expect(appRow.statusId).toBe(draft.id);
  });

  it("staff can override the document gate with a mandatory reason (audited)", async () => {
    const agencyB = await agencyByEmail("ops@agencyb.example");
    const staffB = await userByEmail("b-admin@test.example");
    const superAdmin = await userByEmail("superadmin@test.example");
    await adjustWallet({ agencyId: agencyB.id, amount: 300, reason: "override flow funding", actor: superAdmin });

    const app = await createDraftApplication({ agencyId: agencyB.id, visaTypeId: await visaId(), createdBy: staffB });
    await db.insert(applicantsTb).values({
      applicationId: app.id,
      firstName: "James",
      lastName: "Bond",
      dateOfBirth: "1975-07-07",
      nationality: "British",
      passportNumber: "GB5566778",
      passportExpiryDate: "2033-01-01",
    });

    // staff override without reason → refused
    await expect(
      submitApplication({ applicationId: app.id, actor: superAdmin }),
    ).rejects.toMatchObject({ code: "OVERRIDE_REASON_REQUIRED" });

    const result = await submitApplication({
      applicationId: app.id,
      actor: superAdmin,
      overrideReason: "Original passports held at consulate for renewal; verified copies seen in person.",
    });
    expect(result.charge.balanceAfter).toBe("180.00");

    const appRow = (await db.select().from(applications).where(eq(applications.id, app.id)))[0]!;
    expect(appRow.overrideReason).toContain("consulate");
    expect(appRow.overrideBy).toBe(superAdmin.id);
    const audits = await db.select().from(auditLogs).where(sql`${auditLogs.entityId} = ${app.id} and ${auditLogs.action} = 'APPLICATION_SUBMITTED_OVERRIDE'`);
    expect(audits.length).toBe(1);
  });

  it("agency users can NEVER override the gate", async () => {
    const agencyB = await agencyByEmail("ops@agencyb.example");
    const staffB = await userByEmail("b-admin@test.example");
    const app = await createDraftApplication({ agencyId: agencyB.id, visaTypeId: await visaId(), createdBy: staffB });
    await db.insert(applicantsTb).values({
      applicationId: app.id,
      firstName: "No",
      lastName: "Docs",
      dateOfBirth: "1990-01-01",
      nationality: "British",
      passportNumber: "GB9988111",
      passportExpiryDate: "2033-01-01",
    });
    await expect(
      submitApplication({
        applicationId: app.id,
        actor: staffB,
        overrideReason: "agency trying to bypass the gate with a long enough reason",
      }),
    ).rejects.toMatchObject({ code: "CHECKLIST_INCOMPLETE" });
  });

  it("submission requires at least one applicant", async () => {
    const agencyB = await agencyByEmail("ops@agencyb.example");
    const staffB = await userByEmail("b-admin@test.example");
    const app = await createDraftApplication({ agencyId: agencyB.id, visaTypeId: await visaId(), createdBy: staffB });
    await expect(submitApplication({ applicationId: app.id, actor: staffB })).rejects.toMatchObject({
      code: "NO_APPLICANTS",
    });
  });

  it("AppError codes are stable for UI handling", () => {
    expect(new AppError("X", "msg").code).toBe("X");
  });
});
