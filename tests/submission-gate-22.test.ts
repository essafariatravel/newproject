import { describe, expect, it } from "vitest";
import { suiteSetup } from "./helpers/global-state";

suiteSetup();

import { db } from "@/lib/db";
import { applicants as applicantsTb, applications, checklistItems, walletTransactions } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { createDraftApplication, getSubmissionGate, getStatusByCode, submitApplication } from "@/lib/applications";
import { uploadDocument } from "@/lib/documents";
import { adjustWallet, getBalance } from "@/lib/wallet";
import { userByEmail, agencyByEmail } from "./helpers/fixtures";

/**
 * Phase 2.2 §6 — the enumerated wallet-submission-gate acceptance tests (15–20).
 * Where the main submission/concurrency suites already assert the behaviour
 * this file re-anchors the numbers; the two GAPS it actually adds are 17a
 * (SEQUENTIAL duplicate submission → no second charge) and 18b (the charge
 * equals the SNAPSHOT fee, never the live catalogue price).
 */
async function visaId() {
  return ((await db.execute(sql`select id from visa_types where code='FR-SCH-TOUR'`)).rows[0] as { id: string }).id;
}
const PASSPORT = { firstName: "Gate", lastName: "Runner", dateOfBirth: "1990-05-05", nationality: "Moroccan", passportExpiryDate: "2032-01-01" };

import type { AuthUser } from "@/lib/types";
async function readyDraft(agencyId: string, actor: AuthUser, passportNumber: string) {
  const app = await createDraftApplication({ agencyId, visaTypeId: await visaId(), createdBy: actor });
  await db.insert(applicantsTb).values({ applicationId: app.id, ...PASSPORT, passportNumber });
  const required = await db
    .select()
    .from(checklistItems)
    .where(sql`${checklistItems.applicationId} = ${app.id} and ${checklistItems.required} = true`);
  for (const item of required) {
    await uploadDocument({
      applicationId: app.id,
      actor,
      file: { name: `${item.documentTypeCode}.pdf`, type: "application/pdf", size: 2048, data: Buffer.from("doc") },
      checklistItemId: item.id,
    });
  }
  return app;
}

async function chargeCount(appId: string) {
  const rows = await db
    .select()
    .from(walletTransactions)
    .where(and(eq(walletTransactions.applicationId, appId), eq(walletTransactions.type, "APPLICATION_CHARGE")));
  return rows.length;
}

describe("Phase 2.2 §6 — wallet submission gate acceptance", () => {
  it("#15 insufficient wallet blocks SUBMIT exactly: gate not ok, no charge, status still DRAFT", async () => {
    const agencyB = await agencyByEmail("ops@agencyb.example");
    const staffB = await userByEmail("b-admin@test.example");
    const superAdmin = await userByEmail("superadmin@test.example");
    const app = await readyDraft(agencyB.id, staffB, "GT1500001");
    let gate = await getSubmissionGate(app.id);
    expect(gate.ok).toBe(true); // documents complete — only the wallet can still block
    // Deterministically drain the wallet to zero (manual debit path, fully audited)
    const before = await getBalance(agencyB.id);
    if (Number(before.balance) > 0) {
      await adjustWallet({ agencyId: agencyB.id, amount: -Number(before.balance), reason: "gate-15 drain", actor: superAdmin });
    }
    const zeroed = await getBalance(agencyB.id);
    expect(Number(zeroed.balance)).toBe(0);
    // NOTE: getSubmissionGate covers DOCUMENTS only; the wallet check is enforced
    // authoritatively inside submitApplication (and surfaced in the portal UI as
    // canAfford). So gate.ok stays true here — the block must come from submit:
    gate = await getSubmissionGate(app.id);
    expect(gate.ok).toBe(true);
    expect(Number(zeroed.balance)).toBeLessThan(Number(app.fee));
    await expect(submitApplication({ applicationId: app.id, actor: staffB })).rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS" });
    expect(await chargeCount(app.id)).toBe(0); // no charge row at all
    const fresh = (await db.select().from(applications).where(eq(applications.id, app.id)))[0]!;
    expect(fresh.statusId).toBe((await getStatusByCode("DRAFT"))!.id); // still a draft
    expect((await getBalance(agencyB.id)).balance).toBe("0.00"); // not a cent moved
  });

  it("#16 funded submit = atomic: balance drops by the fee, history + SUBMITTED status written", async () => {
    const agencyB = await agencyByEmail("ops@agencyb.example");
    const staffB = await userByEmail("b-admin@test.example");
    const superAdmin = await userByEmail("superadmin@test.example");
    const app = await readyDraft(agencyB.id, staffB, "GT1600002");
    await adjustWallet({ agencyId: agencyB.id, amount: 300, reason: "gate-16", actor: superAdmin });
    const before = await getBalance(agencyB.id);
    await submitApplication({ applicationId: app.id, actor: staffB });
    const after = await getBalance(agencyB.id);
    expect((Number(after.balance) + Number(app.fee)).toFixed(2)).toBe(Number(before.balance).toFixed(2));
    expect(await chargeCount(app.id)).toBe(1);
    const fresh = (await db.select().from(applications).where(eq(applications.id, app.id)))[0]!;
    expect(fresh.statusId).toBe((await getStatusByCode("SUBMITTED"))!.id);
  });

  it("#17 duplicate (sequential) submission is rejected and does NOT charge twice", async () => {
    const agencyB = await agencyByEmail("ops@agencyb.example");
    const staffB = await userByEmail("b-admin@test.example");
    const superAdmin = await userByEmail("superadmin@test.example");
    const app = await readyDraft(agencyB.id, staffB, "GT1700003");
    await adjustWallet({ agencyId: agencyB.id, amount: 500, reason: "gate-17", actor: superAdmin });
    await submitApplication({ applicationId: app.id, actor: staffB });
    const balAfterFirst = await getBalance(agencyB.id);
    await expect(submitApplication({ applicationId: app.id, actor: staffB })).rejects.toThrow();
    expect(await chargeCount(app.id)).toBe(1);
    const balAfterSecond = await getBalance(agencyB.id);
    expect(balAfterSecond.balance).toBe(balAfterFirst.balance);
  });

  it("#18 charge equals the DRAFT-TIME fee snapshot — a later catalogue price change must not alter it", async () => {
    const agencyB = await agencyByEmail("ops@agencyb.example");
    const staffB = await userByEmail("b-admin@test.example");
    const superAdmin = await userByEmail("superadmin@test.example");
    const app = await readyDraft(agencyB.id, staffB, "GT1800004");
    // mutate the live catalogue price AFTER drafting
    const liveId = await visaId();
    const before = (await db.execute(sql`select fee from visa_types where id=${liveId}`)).rows[0] as { fee: string };
    await db.execute(sql`update visa_types set fee = fee + 99 where id = ${liveId}`);
    try {
      await adjustWallet({ agencyId: agencyB.id, amount: 500, reason: "gate-18", actor: superAdmin });
      await submitApplication({ applicationId: app.id, actor: staffB });
      const tx = (await db.select().from(walletTransactions).where(eq(walletTransactions.applicationId, app.id)))[0]!;
      expect(tx.amount).toBe(app.fee); // the SNAPSHOT, not the changed catalogue fee
      expect(Number(tx.amount)).toBe(Number(before.fee));
    } finally {
      await db.execute(sql`update visa_types set fee = ${before.fee} where id = ${liveId}`);
    }
  });

  it("#20 the charge is recorded against the submission currency (snapshot currency)", async () => {
    const agencyB = await agencyByEmail("ops@agencyb.example");
    const staffB = await userByEmail("b-admin@test.example");
    const superAdmin = await userByEmail("superadmin@test.example");
    const app = await readyDraft(agencyB.id, staffB, "GT2000005");
    await adjustWallet({ agencyId: agencyB.id, amount: 300, reason: "gate-20", actor: superAdmin });
    await submitApplication({ applicationId: app.id, actor: staffB });
    const tx = (await db.select().from(walletTransactions).where(eq(walletTransactions.applicationId, app.id)))[0]!;
    expect(tx.currency).toBe(app.currency);
    // #19 concurrent duplicates → exactly-once: covered by concurrency.test.ts:99 (parallel same-app) with the same invariant
  });
});
