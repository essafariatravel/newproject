import { describe, expect, it } from "vitest";
import { suiteSetup } from "./helpers/global-state";
import { agencyByEmail } from "./helpers/fixtures";
import { db } from "@/lib/db";
import { walletTransactions } from "@/db/schema";
import { runIntegrityChecks } from "@/lib/integrity";

suiteSetup();

describe("financial integrity reconciliation", () => {
  it("has no critical financial corruption in the seeded fixture", async () => {
    const report = await runIntegrityChecks();
    expect(report.status).not.toBe("violation");
    expect(report.status).not.toBe("unavailable");
    expect(report.checks?.negativeBalances).toBe(0);
    expect(report.checks?.walletArithmeticAnomalies).toBe(0);
    expect(report.checks?.walletLedgerContinuityAnomalies).toBe(0);
    expect(report.checks?.walletBalanceMismatches).toBe(0);
    expect(report.checks?.duplicateApplicationCharges).toBe(0);
    expect(report.checks?.processedTopupAnomalies).toBe(0);
  });

  it("detects a malformed ledger row as a data-integrity violation", async () => {
    const agency = await agencyByEmail("ops@agencya.example");

    await db.insert(walletTransactions).values({
      agencyId: agency.id,
      applicationId: null,
      type: "CREDIT",
      amount: "1.00",
      currency: "DZD",
      balanceBefore: "0.00",
      balanceAfter: "0.00",
      reason: "integrity-test-malformed-row",
      actorId: null,
    });

    const report = await runIntegrityChecks();
    expect(report.status).toBe("violation");
    expect(report.checks?.walletArithmeticAnomalies).toBeGreaterThan(0);
  });
});
