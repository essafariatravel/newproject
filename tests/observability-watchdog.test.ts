import { describe, expect, it } from "vitest";
import { classifyPreviewWatchdog } from "../src/lib/observability-watchdog";
import type { DatabaseObservabilitySnapshot } from "../src/lib/database-observability";
import type { IntegrityReport } from "../src/lib/integrity";
import type { ReleaseProtectionReport } from "../src/lib/release-protections";

function healthyDatabase(overrides: Partial<DatabaseObservabilitySnapshot> = {}): DatabaseObservabilitySnapshot {
  return {
    status: "healthy",
    checkedAt: "2026-10-03T00:00:00.000Z",
    connections: {
      max: 60,
      total: 5,
      active: 1,
      idle: 4,
      activeWaiting: 0,
      activeLockWaiting: 0,
      utilizationPct: 8.3,
    },
    transactions: {
      longOver60s: 0,
      waitingLocks: 0,
      deadlocksSinceReset: 0,
      rollbacksSinceReset: 0,
      statsReset: null,
    },
    storage: {
      databaseBytes: 1,
      schemaBytes: 1,
      tempFilesSinceReset: 0,
      tempBytesSinceReset: 0,
    },
    statements: {
      pgStatStatementsEnabled: true,
      meanOver500ms: 0,
      maxMeanExecMs: 0,
      maxSingleExecMs: 0,
      applicationMeanOver500ms: 0,
      applicationMaxMeanExecMs: 0,
      applicationMaxSingleExecMs: 0,
    },
    ...overrides,
  };
}

function integrity(status: IntegrityReport["status"]): IntegrityReport {
  return {
    status,
    checks: status === "unavailable" ? null : {
      negativeBalances: 0,
      legacyNonDzdAgencyWallets: status === "degraded" ? 2 : 0,
      postCutoverNonDzdAgencyWallets: 0,
      legacyNonDzdWalletRows: status === "degraded" ? 4 : 0,
      postCutoverNonDzdWalletRows: 0,
      walletArithmeticAnomalies: 0,
      walletLedgerContinuityAnomalies: 0,
      walletBalanceMismatches: 0,
      duplicateApplicationCharges: 0,
      processedTopupAnomalies: 0,
      legacyFinalDecisionMissingDocument: status === "degraded" ? 1 : 0,
      finalDecisionMissingDocument: 0,
      legacyMissingDocumentBlobs: status === "degraded" ? 3 : 0,
      postCutoverMissingDocumentBlobs: 0,
    },
    checkedAt: "2026-10-03T00:00:00.000Z",
    cutoverAt: "2026-10-03T00:00:00.000Z",
  };
}

function protections(status: ReleaseProtectionReport["status"] = "healthy"): ReleaseProtectionReport {
  return {
    status,
    checkedAt: "2026-10-03T00:00:00.000Z",
    missing: { migrations: [], triggers: [], constraints: [], indexes: [] },
    apiLockdown: {
      anonSchemaUsage: false,
      authenticatedSchemaUsage: false,
      tableGrantCount: 0,
      routineGrantCount: 0,
    },
  };
}

describe("observability watchdog classification", () => {
  it("pages SEV1 only for post-cutover integrity violation", () => {
    expect(
      classifyPreviewWatchdog({
        integrity: integrity("violation"),
        database: healthyDatabase(),
        releaseProtections: protections(),
      }),
    ).toEqual({
      status: "incident",
      severity: "SEV1",
      reasons: ["post_cutover_integrity_violation"],
    });
  });

  it("pages SEV2 for unavailable monitoring or release-protection drift", () => {
    const result = classifyPreviewWatchdog({
      integrity: integrity("unavailable"),
      database: healthyDatabase({ status: "unavailable", connections: null, transactions: null, storage: null, statements: null }),
      releaseProtections: protections("degraded"),
    });

    expect(result.status).toBe("incident");
    expect(result.severity).toBe("SEV2");
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        "integrity_monitor_unavailable",
        "database_observability_unavailable",
        "release_protection_drift_or_unavailable",
      ]),
    );
  });

  it("keeps transient DB degradation as SEV3 without paging", () => {
    const result = classifyPreviewWatchdog({
      integrity: integrity("healthy"),
      database: healthyDatabase({
        status: "degraded",
        connections: {
          max: 60,
          total: 48,
          active: 4,
          idle: 44,
          activeWaiting: 1,
          activeLockWaiting: 0,
          utilizationPct: 80,
        },
      }),
      releaseProtections: protections(),
    });

    expect(result.status).toBe("warning");
    expect(result.severity).toBe("SEV3");
    expect(result.reasons).toEqual(
      expect.arrayContaining(["db_connection_utilization_warning", "db_active_waiting"]),
    );
  });

  it("does not page on the known legacy integrity baseline", () => {
    expect(
      classifyPreviewWatchdog({
        integrity: integrity("degraded"),
        database: healthyDatabase(),
        releaseProtections: protections(),
      }),
    ).toEqual({
      status: "pass_with_legacy_baseline",
      severity: "OK",
      reasons: ["legacy_integrity_baseline_only"],
    });
  });
});
