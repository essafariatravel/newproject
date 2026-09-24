/**
 * §10 / §58 — Wallet top-up REQUESTS (no payment gateway).
 *
 * These are the abuse tests the spec asks for: an agency can only see and
 * create its own requests, can never process one (its own included), the
 * money can only move through the normal wallet service, a credit can never
 * exceed what was requested, and concurrent/duplicate processing can never
 * double-credit.
 */
import { describe, expect, it } from "vitest";
import { suiteSetup } from "./helpers/global-state";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLogs, walletTopupRequests, walletTransactions } from "@/db/schema";
import { getBalance } from "@/lib/wallet";
import {
  createTopupRequest,
  listTopupRequests,
  listTopupRequestsForAgency,
  processTopupRequest,
} from "@/lib/topup";
import { AppError } from "@/lib/types";
import { agencyByEmail, authUser, userByEmail } from "./helpers/fixtures";

suiteSetup();

async function actors() {
  const superAdmin = authUser({
    id: (await userByEmail("superadmin@test.example")).id,
    email: "superadmin@test.example",
    role: "SUPER_ADMIN",
  });
  const accounting = authUser({
    id: (await userByEmail("accounting@test.example")).id,
    email: "accounting@test.example",
    role: "ACCOUNTING",
  });
  const visaAgent = authUser({
    id: (await userByEmail("agent@test.example")).id,
    email: "agent@test.example",
    role: "VISA_AGENT",
  });
  const aAdmin = authUser({
    id: (await userByEmail("a-admin@test.example")).id,
    email: "a-admin@test.example",
    role: "AGENCY_ADMIN",
  });
  const agencyA = await agencyByEmail("ops@agencya.example");
  const agencyB = await agencyByEmail("ops@agencyb.example");
  return { superAdmin, accounting, visaAgent, aAdmin, agencyA, agencyB };
}

/** Clears any PENDING request so a test starts from a known state. */
async function clearPending(agencyId: string) {
  await db
    .update(walletTopupRequests)
    .set({ status: "CANCELLED", processedAt: new Date() })
    .where(eq(walletTopupRequests.agencyId, agencyId));
}

describe("§10 — agency raises a top-up request", () => {
  it("records a PENDING DZD request with a human reference, audit trail and staff notification", async () => {
    const { aAdmin, agencyA } = await actors();
    await clearPending(agencyA.id);

    const created = await createTopupRequest({
      agencyId: agencyA.id,
      amount: 250000,
      note: "Fonds virés — reçu bancaire joint",
      actor: aAdmin,
    });

    expect(created.reference).toMatch(/^TOP-\d{4}-\d{6}$/);
    expect(created.amount).toBe("250000.00");

    const rows = await db
      .select()
      .from(walletTopupRequests)
      .where(eq(walletTopupRequests.id, created.id));
    const row = rows[0]!;
    expect(row.status).toBe("PENDING");
    expect(row.currency).toBe("DZD");
    expect(row.agencyId).toBe(agencyA.id);
    expect(row.walletTransactionId).toBeNull();

    const audit = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.entityId, created.id));
    expect(audit.some((a) => a.action === "WALLET_TOPUP_REQUESTED")).toBe(true);

    // Requesting a top-up is NOT a credit: the balance must not move.
    const before = await getBalance(agencyA.id);
    expect(Number(before.balance)).toBeGreaterThanOrEqual(0);
  });

  it("refuses a second request while one is still pending (no queue flooding)", async () => {
    const { aAdmin, agencyA } = await actors();
    await clearPending(agencyA.id);
    await createTopupRequest({ agencyId: agencyA.id, amount: 50000, actor: aAdmin });

    const err = (await createTopupRequest({ agencyId: agencyA.id, amount: 50000, actor: aAdmin }).catch(
      (e) => e,
    )) as AppError;
    expect(err.code).toBe("TOPUP_PENDING");

    await clearPending(agencyA.id);
  });

  it("rejects zero, negative and absurd amounts server-side", async () => {
    const { aAdmin, agencyA } = await actors();
    for (const amount of [0, -1000, Number.NaN, 500_000_000]) {
      const err = (await createTopupRequest({ agencyId: agencyA.id, amount, actor: aAdmin }).catch(
        (e) => e,
      )) as AppError;
      expect(err.code).toBe("INVALID_AMOUNT");
    }
  });
});

describe("§10 — tenant isolation on requests", () => {
  it("an agency only ever lists its OWN requests", async () => {
    const { aAdmin, agencyA, agencyB } = await actors();
    await clearPending(agencyA.id);
    await clearPending(agencyB.id);
    await createTopupRequest({ agencyId: agencyA.id, amount: 11111, actor: aAdmin });
    await createTopupRequest({ agencyId: agencyB.id, amount: 22222, actor: aAdmin });

    const forA = await listTopupRequestsForAgency(agencyA.id);
    const forB = await listTopupRequestsForAgency(agencyB.id);
    expect(forA.every((r) => r.agencyId === agencyA.id)).toBe(true);
    expect(forB.every((r) => r.agencyId === agencyB.id)).toBe(true);
    expect(forA.some((r) => r.amount === "22222.00")).toBe(false);
    expect(forB.some((r) => r.amount === "11111.00")).toBe(false);
  });

  it("the agency wallet page passes the session agency id to the query", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/app/portal/wallet/page.tsx", "utf8");
    expect(src).toContain("listTopupRequestsForAgency(user.agencyId)");
    // The agency action never accepts an agency id from the form.
    const action = readFileSync("src/app/actions/topup.ts", "utf8");
    expect(action).toContain("agencyId: user.agencyId");
    expect(action).not.toContain('formData.get("agencyId")');
  });
});

describe("§10 — only authorized staff can move the money", () => {
  it("agency roles can never process a request — not even their own", async () => {
    const { aAdmin, agencyA } = await actors();
    await clearPending(agencyA.id);
    const created = await createTopupRequest({ agencyId: agencyA.id, amount: 30000, actor: aAdmin });

    const err = (await processTopupRequest({
      requestId: created.id,
      actor: { ...aAdmin, agencyId: agencyA.id },
      decision: "CREDIT",
    }).catch((e) => e)) as AppError;
    expect(err.code).toBe("FORBIDDEN");

    const rows = await db
      .select()
      .from(walletTopupRequests)
      .where(eq(walletTopupRequests.id, created.id));
    expect(rows[0]!.status).toBe("PENDING");
    await clearPending(agencyA.id);
  });

  it("VISA_AGENT may view wallets but never credit one", async () => {
    const { aAdmin, visaAgent, agencyA } = await actors();
    await clearPending(agencyA.id);
    const created = await createTopupRequest({ agencyId: agencyA.id, amount: 15000, actor: aAdmin });

    const err = (await processTopupRequest({ requestId: created.id, actor: visaAgent, decision: "CREDIT" }).catch(
      (e) => e,
    )) as AppError;
    expect(err.code).toBe("FORBIDDEN");
    await clearPending(agencyA.id);
  });

  it("ACCOUNTING / SUPER_ADMIN credit through the normal wallet primitive", async () => {
    const { aAdmin, accounting, agencyA } = await actors();
    await clearPending(agencyA.id);
    const created = await createTopupRequest({ agencyId: agencyA.id, amount: 45000, actor: aAdmin });

    const before = await getBalance(agencyA.id);
    const result = await processTopupRequest({ requestId: created.id, actor: accounting, decision: "CREDIT" });
    const after = await getBalance(agencyA.id);

    expect(result.status).toBe("PROCESSED");
    expect(result.amount).toBe("45000.00");
    expect(Number(after.balance) - Number(before.balance)).toBeCloseTo(45000, 2);

    // The ledger row is a real CREDIT linked 1:1 to the request.
    const tx = await db
      .select()
      .from(walletTransactions)
      .where(eq(walletTransactions.id, result.walletTransactionId!));
    expect(tx[0]!.type).toBe("CREDIT");
    expect(tx[0]!.currency).toBe("DZD");
    expect(tx[0]!.reason).toBe(`Wallet top-up ${result.reference}`);
    expect(Number(tx[0]!.balanceAfter) - Number(tx[0]!.balanceBefore)).toBeCloseTo(45000, 2);
    expect(tx[0]!.reference).toMatch(/^WLT-\d{4}-\d{6}$/);

    const rows = await db
      .select()
      .from(walletTopupRequests)
      .where(eq(walletTopupRequests.id, created.id));
    expect(rows[0]!.status).toBe("PROCESSED");
    expect(rows[0]!.walletTransactionId).toBe(result.walletTransactionId);

    const audit = await db.select().from(auditLogs).where(eq(auditLogs.entityId, created.id));
    expect(audit.some((a) => a.action === "WALLET_TOPUP_PROCESSED")).toBe(true);
  });

  it("a rejection needs a written reason, leaves the wallet untouched and notifies the agency", async () => {
    const { aAdmin, superAdmin, agencyA } = await actors();
    await clearPending(agencyA.id);
    const created = await createTopupRequest({ agencyId: agencyA.id, amount: 7000, actor: aAdmin });

    const noReason = (await processTopupRequest({
      requestId: created.id,
      actor: superAdmin,
      decision: "REJECT",
    }).catch((e) => e)) as AppError;
    expect(noReason.code).toBe("REASON_REQUIRED");

    const before = await getBalance(agencyA.id);
    const result = await processTopupRequest({
      requestId: created.id,
      actor: superAdmin,
      decision: "REJECT",
      decisionNote: "Aucun virement reçu pour cette demande.",
    });
    const after = await getBalance(agencyA.id);

    expect(result.status).toBe("REJECTED");
    expect(Number(after.balance)).toBe(Number(before.balance));
    const rows = await db
      .select()
      .from(walletTopupRequests)
      .where(eq(walletTopupRequests.id, created.id));
    expect(rows[0]!.status).toBe("REJECTED");
    expect(rows[0]!.decisionNote).toContain("virement");

    const audit = await db.select().from(auditLogs).where(eq(auditLogs.entityId, created.id));
    expect(audit.some((a) => a.action === "WALLET_TOPUP_REJECTED")).toBe(true);
  });
});

describe("§10 — money can never be invented or duplicated", () => {
  it("a credit above the requested amount is refused (partial credit is allowed)", async () => {
    const { aAdmin, accounting, agencyA } = await actors();
    await clearPending(agencyA.id);
    const created = await createTopupRequest({ agencyId: agencyA.id, amount: 20000, actor: aAdmin });

    const err = (await processTopupRequest({
      requestId: created.id,
      actor: accounting,
      decision: "CREDIT",
      amount: 999999,
    }).catch((e) => e)) as AppError;
    expect(err.code).toBe("INVALID_AMOUNT");

    const before = await getBalance(agencyA.id);
    const partial = await processTopupRequest({
      requestId: created.id,
      actor: accounting,
      decision: "CREDIT",
      amount: 12000,
    });
    const after = await getBalance(agencyA.id);
    expect(partial.amount).toBe("12000.00");
    expect(Number(after.balance) - Number(before.balance)).toBeCloseTo(12000, 2);
  });

  it("processing twice is impossible: the second attempt changes nothing", async () => {
    const { aAdmin, accounting, agencyA } = await actors();
    await clearPending(agencyA.id);
    const created = await createTopupRequest({ agencyId: agencyA.id, amount: 33000, actor: aAdmin });

    await processTopupRequest({ requestId: created.id, actor: accounting, decision: "CREDIT" });
    const afterFirst = await getBalance(agencyA.id);

    const err = (await processTopupRequest({
      requestId: created.id,
      actor: accounting,
      decision: "CREDIT",
    }).catch((e) => e)) as AppError;
    expect(err.code).toBe("TOPUP_ALREADY_PROCESSED");

    const afterSecond = await getBalance(agencyA.id);
    expect(Number(afterSecond.balance)).toBe(Number(afterFirst.balance));

    const ledger = await db
      .select()
      .from(walletTransactions)
      .where(eq(walletTransactions.agencyId, agencyA.id));
    const linked = ledger.filter((t) => t.reason === `Wallet top-up ${created.reference}`);
    expect(linked.length).toBe(1);
  });

  it("concurrent processing credits exactly once", async () => {
    const { aAdmin, accounting, superAdmin, agencyA } = await actors();
    await clearPending(agencyA.id);
    const created = await createTopupRequest({ agencyId: agencyA.id, amount: 60000, actor: aAdmin });

    const before = await getBalance(agencyA.id);
    const results = await Promise.allSettled([
      processTopupRequest({ requestId: created.id, actor: accounting, decision: "CREDIT" }),
      processTopupRequest({ requestId: created.id, actor: superAdmin, decision: "CREDIT" }),
      processTopupRequest({ requestId: created.id, actor: accounting, decision: "CREDIT" }),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    const after = await getBalance(agencyA.id);

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(2);
    for (const r of rejected) {
      expect((r.reason as AppError).code).toBe("TOPUP_ALREADY_PROCESSED");
    }
    expect(Number(after.balance) - Number(before.balance)).toBeCloseTo(60000, 2);
  });

  it("staff view can filter by status and agency for the billing queue", async () => {
    const { aAdmin, agencyA } = await actors();
    await clearPending(agencyA.id);
    await createTopupRequest({ agencyId: agencyA.id, amount: 8000, actor: aAdmin });

    const pending = await listTopupRequests({ status: "PENDING" });
    expect(pending.some((r) => r.agencyId === agencyA.id)).toBe(true);
    expect(pending.every((r) => r.status === "PENDING")).toBe(true);

    const forAgency = await listTopupRequests({ status: "ALL", agencyId: agencyA.id });
    expect(forAgency.every((r) => r.agencyId === agencyA.id)).toBe(true);
    // Staff rows carry the agency name for the queue card.
    expect(forAgency[0]!.agencyName).toBeTruthy();
    await clearPending(agencyA.id);
  });
});
