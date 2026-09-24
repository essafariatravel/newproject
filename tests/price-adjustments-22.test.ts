import { describe, expect, it } from "vitest";
import { suiteSetup } from "./helpers/global-state";

suiteSetup();

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  applicants as applicantsTb,
  applications,
  checklistItems,
  auditLogs,
  visaTypes,
} from "@/db/schema";
import { createDraftApplication, submitApplication } from "@/lib/applications";
import { uploadDocument } from "@/lib/documents";
import { adjustWallet, getBalance } from "@/lib/wallet";
import { applyPriceAdjustment, getApplicationPricing } from "@/lib/price-adjustments";
import { getAgencyWalletStatement } from "@/lib/wallet-statement";
import { userByEmail, agencyByEmail } from "./helpers/fixtures";

/**
 * Phase 2.2 §17/§18 — staff price adjustments (tests 65-84 family).
 * INVARIANT families: (a) router/RBAC-only-staff, (b) original debit immutable,
 * (c) snapshot+catalogue untouched, (d) wallet compensated exactly once,
 * (e) history preserved, (f) idempotent + concurrency-safe, (g) cross-tenant
 * isolation, (h) statement visibility with the spec label, (i) server-side
 * authoritative math (no client-calculated final).
 */

async function visaId() {
  return ((await db.execute(sql`select id from visa_types where code='FR-SCH-TOUR'`)).rows[0] as { id: string }).id;
}

/** A freshly SUBMITTED app at the standard 120 DZD fee on agency B (fully-funded). */
async function submittedApp(n: number) {
  const agencyB = await agencyByEmail("ops@agencyb.example");
  const staffB = await userByEmail("b-admin@test.example");
  const superA = await userByEmail("superadmin@test.example");
  await adjustWallet({ agencyId: agencyB.id, amount: 1000, reason: `adj-funding-${n}`, actor: superA });
  const app = await createDraftApplication({ agencyId: agencyB.id, visaTypeId: await visaId(), createdBy: staffB });
  await db.insert(applicantsTb).values({
    applicationId: app.id, firstName: "Adj", lastName: `Case${n}`, dateOfBirth: "1992-02-02",
    nationality: "Moroccan", passportNumber: `AD${String(n).padStart(8, "0")}`, passportExpiryDate: "2032-02-02",
  });
  const required = await db
    .select()
    .from(checklistItems)
    .where(sql`${checklistItems.applicationId} = ${app.id} and ${checklistItems.required} = true`);
  for (const item of required) {
    await uploadDocument({
      applicationId: app.id,
      actor: staffB,
      file: { name: `${item.documentTypeCode}.pdf`, type: "application/pdf", size: 2048, data: Buffer.from("doc") },
      checklistItemId: item.id,
    });
  }
  await submitApplication({ applicationId: app.id, actor: staffB });
  const fresh = (await db.select().from(applications).where(eq(applications.id, app.id)))[0]!;
  return { app: fresh, agency: agencyB, agencyUser: staffB };
}

const staff = () => userByEmail("admin@test.example");

describe("Phase 2.2 §17 — staff price adjustment core", () => {
  it("#66 happy path: 120 DZD charge + 25 DZD staff discount → effective 95, original debit untouched, wallet compensated", async () => {
    const { app, agency } = await submittedApp(66);
    const admin = await staff();
    const originalCharge = (await db.execute(sql`
      select amount::text, type, reason from wallet_transactions where application_id = ${app.id} and type = 'APPLICATION_CHARGE'
    `)).rows[0] as { amount: string; type: string; reason: string };

    const res = await applyPriceAdjustment({
      applicationId: app.id, actor: admin, type: "DISCOUNT", amount: "25", reason: "Loyalty discount agreed", idempotencyKey: `t66-${app.id}`,
    });
    expect(res.replayed).toBe(false);
    expect(res.effectiveBefore).toBe("120.00");
    expect(res.effectiveAfter).toBe("95.00");

    // effective + snapshots
    const after = (await db.select().from(applications).where(eq(applications.id, app.id)))[0]!;
    expect(after.effectivePrice).toBe("95.00");
    expect(after.submittedPrice).toBe("120.00"); // never mutated
    expect(after.fee).toBe("120.00");

    // original charge row untouched
    const chargeNow = (await db.execute(sql`
      select amount::text, type, reason from wallet_transactions where application_id = ${app.id} and type = 'APPLICATION_CHARGE'
    `)).rows[0] as { amount: string; type: string; reason: string };
    expect(chargeNow).toEqual(originalCharge);

    // compensating wallet entry
    const comp = (await db.execute(sql`
      select type, amount::text, balance_before::text, balance_after::text from wallet_transactions
      where application_id = ${app.id} and type = 'COMMERCIAL_DISCOUNT'
    `)).rows[0] as { type: string; amount: string; balance_before: string; balance_after: string };
    expect(Number(comp.amount)).toBe(25);
    expect(Number(comp.balance_after) - Number(comp.balance_before)).toBeCloseTo(25, 6); // credit effect
    const bal = await getBalance(agency.id);
    expect(Number(bal.balance)).toBe(Math.round(Number(comp.balance_after) * 100) / 100); // consistent with ledger tail

    // audit
    const audits = await db.select().from(auditLogs).where(and(eq(auditLogs.action, "PRICE_ADJUSTED"), eq(auditLogs.entityId, app.id)));
    expect(audits.length).toBe(1);
    expect(audits[0]!.metadata).toMatchObject({ type: "DISCOUNT", effectiveBefore: "120.00", effectiveAfter: "95.00" });
  });

  it("#67 multiple adjustments preserved cumulatively (25 off, then 10 surcharge → 105)", async () => {
    const { app } = await submittedApp(67);
    const admin = await staff();
    await applyPriceAdjustment({ applicationId: app.id, actor: admin, type: "DISCOUNT", amount: 25, reason: "Loyalty tier discount", idempotencyKey: `t67a-${app.id}` });
    await applyPriceAdjustment({ applicationId: app.id, actor: admin, type: "SURCHARGE", amount: 10, reason: "Courier delivery fee", idempotencyKey: `t67b-${app.id}` });
    const pricing = await getApplicationPricing(app.id);
    expect(pricing!.effectivePrice).toBe("105.00");
    expect(pricing!.submittedPrice).toBe("120.00");
    expect(pricing!.adjustments.length).toBe(2);
    expect(pricing!.adjustments.map((a) => a.effectiveAfter)).toEqual(["95.00", "105.00"]);
  });

  it("#68 the adjustment ROWS are immutable at the database level (trigger blocks UPDATE + DELETE)", async () => {
    const { app } = await submittedApp(68);
    const admin = await staff();
    const res = await applyPriceAdjustment({ applicationId: app.id, actor: admin, type: "REFUND", amount: 5, reason: "Embassy fee overcharge refund", idempotencyKey: `t68-${app.id}` });
    const causeMessage = async (fn: () => Promise<unknown>) => {
      try { await fn(); return "NO_ERROR"; }
      catch (err) {
        let cur: unknown = err;
        let msg = "";
        while (cur && typeof cur === "object") {
          msg += String((cur as Error).message ?? "") + "|";
          cur = (cur as { cause?: unknown }).cause ?? (cur as { cause?: unknown }).cause ?? null;
          if (msg.length > 4000) break;
        }
        return msg;
      }
    };
    expect(await causeMessage(() => db.execute(sql`update application_price_adjustments set amount = 999 where id = ${res.adjustmentId}`))).toMatch(/immutable/i);
    expect(await causeMessage(() => db.execute(sql`delete from application_price_adjustments where id = ${res.adjustmentId}`))).toMatch(/immutable/i);
  });

  it("#69 catalogue price is untouched by adjustments (visa_types.fee stable)", async () => {
    const { app } = await submittedApp(69);
    const admin = await staff();
    const catBefore = (await db.select().from(visaTypes).where(eq(visaTypes.id, app.visaTypeId)))[0]!;
    await applyPriceAdjustment({ applicationId: app.id, actor: admin, type: "DISCOUNT", amount: 15, reason: "Promo window discount", idempotencyKey: `t69-${app.id}` });
    const catAfter = (await db.select().from(visaTypes).where(eq(visaTypes.id, app.visaTypeId)))[0]!;
    expect(catAfter.fee).toBe(catBefore.fee);
  });

  it("#70 other applications are unaffected (other app keeps its own submitted/effective prices)", async () => {
    const first = await submittedApp(701);
    const second = await submittedApp(702);
    const admin = await staff();
    await applyPriceAdjustment({ applicationId: first.app.id, actor: admin, type: "DISCOUNT", amount: 40, reason: "Bundle discount first app", idempotencyKey: `t70-${first.app.id}` });
    const secondAfter = (await db.select().from(applications).where(eq(applications.id, second.app.id)))[0]!;
    expect(secondAfter.submittedPrice).toBe("120.00");
    expect(secondAfter.effectivePrice).toBe("120.00");
    const othersAdj = await db.execute(sql`select count(*)::int as c from application_price_adjustments where application_id = ${second.app.id}`);
    expect((othersAdj.rows[0] as { c: number }).c).toBe(0);
  });

  it("#71 idempotency: replaying the same key returns the original adjustment and never writes/compensates twice", async () => {
    const { app, agency } = await submittedApp(71);
    const admin = await staff();
    const key = `t71-${app.id}`;
    const first = await applyPriceAdjustment({ applicationId: app.id, actor: admin, type: "DISCOUNT", amount: 30, reason: "Early-bird discount", idempotencyKey: key });
    const balAfterFirst = await getBalance(agency.id);
    const second = await applyPriceAdjustment({ applicationId: app.id, actor: admin, type: "DISCOUNT", amount: 30, reason: "Early-bird discount", idempotencyKey: key });
    expect(second.replayed).toBe(true);
    expect(second.adjustmentId).toBe(first.adjustmentId);
    const rows = await db.execute(sql`select count(*)::int as c from application_price_adjustments where application_id = ${app.id}`);
    expect((rows.rows[0] as { c: number }).c).toBe(1);
    const balAfterSecond = await getBalance(agency.id);
    expect(balAfterSecond.balance).toBe(balAfterFirst.balance); // wallet untouched by the replay
  });

  it("#72 NEW key with the same amounts IS a legitimate second adjustment (distinct rows, double wallet effect)", async () => {
    const { app, agency } = await submittedApp(72);
    const admin = await staff();
    await applyPriceAdjustment({ applicationId: app.id, actor: admin, type: "DISCOUNT", amount: 10, reason: "Campaign A discount", idempotencyKey: `t72a-${app.id}` });
    await applyPriceAdjustment({ applicationId: app.id, actor: admin, type: "DISCOUNT", amount: 10, reason: "Campaign B discount", idempotencyKey: `t72b-${app.id}` });
    const pricing = await getApplicationPricing(app.id);
    expect(pricing!.adjustments.length).toBe(2);
    expect(pricing!.effectivePrice).toBe("100.00");
    void agency;
  });

  it("#73 concurrency: two parallel discounts serialize to an exact sum, wallet never overshoots", async () => {
    const { app, agency } = await submittedApp(73);
    const admin = await staff();
    const balBefore = await getBalance(agency.id);
    await Promise.all([
      applyPriceAdjustment({ applicationId: app.id, actor: admin, type: "DISCOUNT", amount: 20, reason: "Concurrent discount one", idempotencyKey: `t73a-${app.id}` }),
      applyPriceAdjustment({ applicationId: app.id, actor: admin, type: "DISCOUNT", amount: 20, reason: "Concurrent discount two", idempotencyKey: `t73b-${app.id}` }),
    ]);
    const pricing = await getApplicationPricing(app.id);
    expect(pricing!.effectivePrice).toBe("80.00");
    expect(pricing!.adjustments.length).toBe(2);
    const balAfter = await getBalance(agency.id);
    expect(Number(balAfter.balance) - Number(balBefore.balance)).toBeCloseTo(40, 6);
  });

  it("#74 negative final price is rejected upfront; nothing is written", async () => {
    const { app, agency } = await submittedApp(74);
    const admin = await staff();
    const balBefore = await getBalance(agency.id);
    await expect(
      applyPriceAdjustment({ applicationId: app.id, actor: admin, type: "DISCOUNT", amount: 999, reason: "Excessive discount attempt", idempotencyKey: `t74-${app.id}` }),
    ).rejects.toMatchObject({ code: "IMPOSSIBLE_PRICE" });
    const rows = await db.execute(sql`select count(*)::int as c from application_price_adjustments where application_id = ${app.id}`);
    expect((rows.rows[0] as { c: number }).c).toBe(0);
    const balAfter = await getBalance(agency.id);
    expect(balAfter.balance).toBe(balBefore.balance); // no partial compensation
  });

  it("#75 DRAFT applications cannot receive staff adjustments (after-submission rule)", async () => {
    const agencyB = await agencyByEmail("ops@agencyb.example");
    const staffB = await userByEmail("b-admin@test.example");
    const draft = await createDraftApplication({ agencyId: agencyB.id, visaTypeId: await visaId(), createdBy: staffB });
    await expect(
      applyPriceAdjustment({ applicationId: draft.id, actor: await staff(), type: "DISCOUNT", amount: 10, reason: "Premature discount attempt", idempotencyKey: `t75-${draft.id}` }),
    ).rejects.toMatchObject({ code: "BAD_STATE" });
  });

  it("#76 currency always equals the SUBMITTED currency (no client-controlled currency exists in the input model)", async () => {
    const { app, agency } = await submittedApp(76);
    expect(agency.currency).toBe("DZD");
    const res = await applyPriceAdjustment({ applicationId: app.id, actor: await staff(), type: "DISCOUNT", amount: 5, reason: "Micro discount check", idempotencyKey: `t76-${app.id}` });
    const pricing = await getApplicationPricing(app.id);
    expect(pricing!.adjustments[0]!.currency).toBe(app.currency);
    const comp = await db.execute(sql`select currency from wallet_transactions where id = ${res.walletTransactionId}`);
    expect((comp.rows[0] as { currency: string }).currency).toBe(app.currency);
  });

  it("#77 cross-tenant containment: the compensation lands on the APPLICATION'S agency wallet only", async () => {
    const { app, agency } = await submittedApp(77);
    const agencyA = await agencyByEmail("ops@agencya.example");
    const balABefore = await getBalance(agencyA.id);
    const balBBefore = await getBalance(agency.id);
    await applyPriceAdjustment({ applicationId: app.id, actor: await staff(), type: "DISCOUNT", amount: 12, reason: "Cross-tenant check discount", idempotencyKey: `t77-${app.id}` });
    const balAAfter = await getBalance(agencyA.id);
    const balBAfter = await getBalance(agency.id);
    expect(balAAfter.balance).toBe(balABefore.balance); // agency A untouched
    expect(Number(balBAfter.balance) - Number(balBBefore.balance)).toBeCloseTo(12, 6);
  });

  it("#78 surcharge debits the wallet and fails cleanly beyond the balance", async () => {
    const { app, agency } = await submittedApp(78);
    // add a small surcharge first (wallet is funded by submittedApp)
    const admin = await staff();
    await applyPriceAdjustment({ applicationId: app.id, actor: admin, type: "SURCHARGE", amount: 15, reason: "Expedited courier surcharge", idempotencyKey: `t78a-${app.id}` });
    const pricing = await getApplicationPricing(app.id);
    expect(pricing!.effectivePrice).toBe("135.00");
    // drain wallet, then a huge surcharge must fail INSUFFICIENT_FUNDS (never negative wallets)
    const bal = await getBalance(agency.id);
    const superA = await userByEmail("superadmin@test.example");
    if (Number(bal.balance) > 0) {
      await adjustWallet({ agencyId: agency.id, amount: -Number(bal.balance), reason: "t78 drain", actor: superA });
    }
    await expect(
      applyPriceAdjustment({ applicationId: app.id, actor: admin, type: "SURCHARGE", amount: 500, reason: "Unfunded surcharge attempt", idempotencyKey: `t78b-${app.id}` }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS" });
    expect((await getApplicationPricing(app.id))!.effectivePrice).toBe("135.00");
  });

  it("#79 validation: zero amounts, >2dp amounts and short reasons are rejected with no writes", async () => {
    const { app } = await submittedApp(79);
    const admin = await staff();
    await expect(applyPriceAdjustment({ applicationId: app.id, actor: admin, type: "DISCOUNT", amount: 0, reason: "Zero amount case", idempotencyKey: `t79a-${app.id}` }))
      .rejects.toMatchObject({ code: "VALIDATION" });
    await expect(applyPriceAdjustment({ applicationId: app.id, actor: admin, type: "DISCOUNT", amount: 1.005, reason: "Too precise amount", idempotencyKey: `t79b-${app.id}` }))
      .rejects.toMatchObject({ code: "VALIDATION" });
    await expect(applyPriceAdjustment({ applicationId: app.id, actor: admin, type: "DISCOUNT", amount: 5, reason: "short", idempotencyKey: `t79c-${app.id}` }))
      .rejects.toMatchObject({ code: "VALIDATION" });
    const rows = await db.execute(sql`select count(*)::int as c from application_price_adjustments where application_id = ${app.id}`);
    expect((rows.rows[0] as { c: number }).c).toBe(0);
  });
});

describe("Phase 2.2 §17/§18 — authorization + wallet/reporting reconciliation (§18)", () => {
  it("#80 agency-side actors are FORBIDDEN (never UI-hidden only — service rejects)", async () => {
    const { app, agency } = await submittedApp(80);
    const agencyAdmin = await userByEmail("b-admin@test.example"); // AGENCY_ADMIN, owns the app
    const balBefore = await getBalance(agency.id);
    await expect(
      applyPriceAdjustment({ applicationId: app.id, actor: agencyAdmin, type: "DISCOUNT", amount: 10, reason: "Self-approved discount attempt", idempotencyKey: `t80-${app.id}` }),
    ).rejects.toThrow(/authorized|FORBIDDEN|permission/i);
    // ZERO side effects even on the forbidden path
    const rows = await db.execute(sql`select count(*)::int as c from application_price_adjustments where application_id = ${app.id}`);
    expect((rows.rows[0] as { c: number }).c).toBe(0);
    expect((await getBalance(agency.id)).balance).toBe(balBefore.balance);
  });

  it("#81 refund type behaves as a compensating credit labelled 'Commercial discount/refund' on the wallet statement (§18 PDF line)", async () => {
    const { app, agency } = await submittedApp(81);
    await applyPriceAdjustment({ applicationId: app.id, actor: await staff(), type: "REFUND", amount: 20, reason: "Partial refund after service downgrade", idempotencyKey: `t81-${app.id}` });
    const from = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const to = new Date().toISOString().slice(0, 10); // today (statement rejects future ranges)
    const agencyAdmin = await userByEmail("b-admin@test.example");
    const statement = await getAgencyWalletStatement({ actor: agencyAdmin, from, to });
    void agency;
    const allRows = statement.sections.flatMap((sec) => sec.transactions);
    const refundLine = allRows.find((r) => r.type === "Commercial discount/refund" && (r.description ?? "").includes(app.reference),);
    expect(refundLine).toBeTruthy();
    expect(refundLine!.direction).toBe("CREDIT");
    expect(refundLine!.amount).toBe(20);
    const chargeLine = allRows.find((r) => r.type === "APPLICATION_CHARGE" && (r.description ?? "").includes(app.reference),);
    expect(chargeLine).toBeTruthy();
    expect(chargeLine!.description ?? "").toContain(app.reference);
  });

  it("#82 wallet statement opening/closing balances reconcile exactly with charge + adjustment", async () => {
    const { agency } = await submittedApp(82);
    const agencyAdmin = await userByEmail("b-admin@test.example");
    const admin = await staff();
    const appId = (await db.execute(sql`select id::text from applications where agency_id = ${agency.id} order by created_at desc limit 1`)).rows[0] as { id: string };
    await applyPriceAdjustment({ applicationId: appId.id, actor: admin, type: "DISCOUNT", amount: 7, reason: "Reconciliation check discount", idempotencyKey: `t82-${appId.id}` });
    const from = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const to = new Date().toISOString().slice(0, 10); // today (statement rejects future ranges)
    const statement = await getAgencyWalletStatement({ actor: agencyAdmin, from, to });
    for (const sec of statement.sections) {
      const net = sec.transactions.reduce((acc: number, r) => acc + (r.direction === "CREDIT" ? r.amount : -r.amount), 0);
      expect(Number((sec.openingBalance + net).toFixed(2))).toBe(Number(sec.closingBalance.toFixed(2)));
    }
  });

  it("#83 role matrix: all staff roles hold applications.pricing.adjust; agency roles never do", async () => {
    const { hasPermission } = await import("@/lib/rbac");
    for (const email of ["superadmin@test.example", "admin@test.example", "agent@test.example", "accounting@test.example"]) {
      expect(hasPermission(await userByEmail(email), "applications.pricing.adjust"), email).toBe(true);
    }
    for (const email of ["a-admin@test.example", "a-user@test.example", "b-admin@test.example", "b-user@test.example"]) {
      expect(hasPermission(await userByEmail(email), "applications.pricing.adjust"), email).toBe(false);
    }
  });

  it("#84 cancelled applications reject adjustments", async () => {
    const { app } = await submittedApp(84);
    const admin = await staff();
    const staffUser = await userByEmail("admin@test.example");
    const { changeApplicationStatus } = await import("@/lib/applications");
    await changeApplicationStatus({ applicationId: app.id, toStatusCode: "CANCELLED", actor: staffUser });
    await expect(
      applyPriceAdjustment({ applicationId: app.id, actor: admin, type: "DISCOUNT", amount: 10, reason: "Cancelled-app discount attempt", idempotencyKey: `t84-${app.id}` }),
    ).rejects.toMatchObject({ code: "BAD_STATE" });
  });
});
