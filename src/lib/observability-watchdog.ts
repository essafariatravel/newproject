import type { DatabaseObservabilitySnapshot } from "@/lib/database-observability";
import type { IntegrityReport } from "@/lib/integrity";
import type { ReleaseProtectionReport } from "@/lib/release-protections";

export type WatchdogSeverity = "OK" | "SEV3" | "SEV2" | "SEV1";
export type WatchdogStatus = "pass" | "pass_with_legacy_baseline" | "warning" | "incident";

export interface WatchdogClassification {
  status: WatchdogStatus;
  severity: WatchdogSeverity;
  reasons: string[];
}

export function classifyPreviewWatchdog(input: {
  integrity: IntegrityReport;
  database: DatabaseObservabilitySnapshot;
  releaseProtections: ReleaseProtectionReport;
}): WatchdogClassification {
  const reasons: string[] = [];

  if (input.integrity.status === "violation") {
    reasons.push("post_cutover_integrity_violation");
    return { status: "incident", severity: "SEV1", reasons };
  }

  if (input.integrity.status === "unavailable") {
    reasons.push("integrity_monitor_unavailable");
  }
  if (input.database.status === "unavailable") {
    reasons.push("database_observability_unavailable");
  }
  if (input.releaseProtections.status !== "healthy") {
    reasons.push("release_protection_drift_or_unavailable");
  }

  if (reasons.length > 0) {
    return { status: "incident", severity: "SEV2", reasons };
  }

  if (input.database.status === "degraded") {
    const connections = input.database.connections;
    const transactions = input.database.transactions;
    if ((connections?.utilizationPct ?? 0) >= 70) reasons.push("db_connection_utilization_warning");
    if ((connections?.activeWaiting ?? 0) > 0) reasons.push("db_active_waiting");
    if ((connections?.activeLockWaiting ?? 0) > 0) reasons.push("db_lock_waiting");
    if ((transactions?.waitingLocks ?? 0) > 0) reasons.push("db_waiting_locks");
    if ((transactions?.longOver60s ?? 0) > 0) reasons.push("db_long_transaction");

    return {
      status: "warning",
      severity: "SEV3",
      reasons: reasons.length > 0 ? reasons : ["database_degraded"],
    };
  }

  if (input.integrity.status === "degraded") {
    return {
      status: "pass_with_legacy_baseline",
      severity: "OK",
      reasons: ["legacy_integrity_baseline_only"],
    };
  }

  return { status: "pass", severity: "OK", reasons: [] };
}
