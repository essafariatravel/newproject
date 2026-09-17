import { describe, expect, it } from "vitest";
import { suiteSetup } from "./helpers/global-state";

suiteSetup();

import { db } from "@/lib/db";
import { agencies, auditLogs, walletTransactions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { adjustWallet, getBalance } from "@/lib/wallet";
import { userByEmail, agencyByEmail } from "./helpers/fixtures";

describe("wallet ledger integrity", () => {
  it("credits record before/after balances and audit metadata", async () => {
    const agencyA = await agencyByEmail("ops@agencya.example");
    const staff = await userByEmail("accounting@test.example");

    await adjustWallet({ agencyId: agencyA.id, amount: 1000, reason: "initial funding", actor: staff });
    await adjustWallet({ agencyId: agencyA.id, amount: -200, reason: "correction", actor: staff });

    const txs = await db
      .select()
      .from(walletTransactions)
      .where(eq(walletTransactions.agencyId, agencyA.id))
      .orderBy(walletTransactions.createdAt);
    expect(txs.length).toBe(2);
    if (txs.length !== 2) throw new Error("expected exactly 2 transactions");
    const credit = txs[0]!;
    const debit = txs[1]!;
    expect(credit.type).toBe("CREDIT");
    expect(credit.balanceBefore).toBe("0.00");
    expect(credit.balanceAfter).toBe("1000.00");
    expect(debit.type).toBe("DEBIT");
    expect(debit.balanceBefore).toBe("1000.00");
    expect(debit.balanceAfter).toBe("800.00");

    const bal = await getBalance(agencyA.id);
    expect(bal.balance).toBe("800.00");

    const audits = await db.select().from(auditLogs);
    expect(audits.some((a) => a.action === "WALLET_CREDIT")).toBe(true);
    expect(audits.some((a) => a.action === "WALLET_DEBIT")).toBe(true);
  });

  it("rejects debits exceeding the balance — no negative wallets, ever", async () => {
    const agencyA = await agencyByEmail("ops@agencya.example");
    const staff = await userByEmail("accounting@test.example");
    await expect(
      adjustWallet({ agencyId: agencyA.id, amount: -900, reason: "overdraft attempt", actor: staff }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS" });
    const bal = await getBalance(agencyA.id);
    expect(bal.balance).toBe("800.00");
  });

  it("database check constraint blocks negative balances at the lowest level", async () => {
    const agencyB = await agencyByEmail("ops@agencyb.example");
    await expect(
      db.update(agencies).set({ balance: "-1" }).where(eq(agencies.id, agencyB.id)),
    ).rejects.toSatisfy((err: unknown) => {
      // drizzle wraps driver errors — the PG check-constraint detail sits on err.cause
      const cause = (err as { cause?: { message?: string } }).cause;
      return /agencies_balance_nonnegative|violates/i.test(cause?.message ?? String(err));
    });
  });

  it("every manual adjustment carries actor + reason (no silent adjustments)", async () => {
    const agencyA = await agencyByEmail("ops@agencya.example");
    const txs = await db.select().from(walletTransactions).where(eq(walletTransactions.agencyId, agencyA.id));
    for (const tx of txs) {
      expect(tx.reason.length).toBeGreaterThan(0);
      expect(tx.actorId).not.toBeNull();
      expect(tx.balanceBefore).toBeDefined();
      expect(tx.balanceAfter).toBeDefined();
    }
  });

  it("rejects zero and non-finite amounts", async () => {
    const agencyA = await agencyByEmail("ops@agencya.example");
    const staff = await userByEmail("accounting@test.example");
    await expect(adjustWallet({ agencyId: agencyA.id, amount: 0, reason: "x", actor: staff })).rejects.toMatchObject({ code: "INVALID_AMOUNT" });
    await expect(adjustWallet({ agencyId: agencyA.id, amount: Number.NaN, reason: "x", actor: staff })).rejects.toMatchObject({ code: "INVALID_AMOUNT" });
  });
});
