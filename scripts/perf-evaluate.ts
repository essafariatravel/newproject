import { readFile } from "node:fs/promises";

type K6Metric = { values?: Record<string, number>; thresholds?: Record<string, { ok: boolean }> };
type K6Summary = { metrics?: Record<string, K6Metric> };
type DbSnapshot = {
  label?: string;
  target?: unknown;
  waitingLocks?: number;
  databaseStats?: Array<Record<string, unknown>>;
  tableStats?: Array<Record<string, unknown>>;
  pgStatStatements?: Array<Record<string, unknown>>;
  connections?: Array<Record<string, unknown>>;
};

function number(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return Number.NaN;
}

function metric(summary: K6Summary, name: string, value: string): number {
  return number(summary.metrics?.[name]?.values?.[value]);
}

function dbStat(snapshot: DbSnapshot, key: string): number {
  return number(snapshot.databaseStats?.[0]?.[key]);
}

function connectionCount(snapshot: DbSnapshot): number {
  return (snapshot.connections ?? []).reduce((sum, row) => sum + (number(row.connections) || 0), 0);
}

function statementDeltas(before: DbSnapshot, after: DbSnapshot) {
  const old = new Map((before.pgStatStatements ?? []).map((row) => [String(row.queryid), row]));
  return (after.pgStatStatements ?? []).map((row) => {
    const prior = old.get(String(row.queryid));
    return {
      queryid: String(row.queryid),
      callsDelta: number(row.calls) - (prior ? number(prior.calls) : 0),
      totalExecMsDelta: number(row.total_exec_ms) - (prior ? number(prior.total_exec_ms) : 0),
      meanExecMs: number(row.mean_exec_ms),
      maxExecMs: number(row.max_exec_ms),
      normalizedQuery: String(row.normalized_query ?? ""),
    };
  }).filter((row) => row.callsDelta > 0)
    .sort((a, b) => b.totalExecMsDelta - a.totalExecMsDelta)
    .slice(0, 15);
}

function tableDeltas(before: DbSnapshot, after: DbSnapshot) {
  const old = new Map((before.tableStats ?? []).map((row) => [String(row.relname), row]));
  return (after.tableStats ?? []).map((row) => {
    const prior = old.get(String(row.relname));
    return {
      table: String(row.relname),
      seqScanDelta: number(row.seq_scan) - (prior ? number(prior.seq_scan) : 0),
      idxScanDelta: number(row.idx_scan) - (prior ? number(prior.idx_scan) : 0),
      liveRows: number(row.n_live_tup),
      deadRows: number(row.n_dead_tup),
      totalBytes: number(row.total_bytes),
    };
  }).sort((a, b) => b.seqScanDelta - a.seqScanDelta).slice(0, 15);
}

async function jsonFile<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function main() {
  const [summaryPath, beforePath, afterPath] = process.argv.slice(2);
  if (!summaryPath || !beforePath || !afterPath) {
    throw new Error("Usage: npx tsx scripts/perf-evaluate.ts <k6-summary.json> <before-db.json> <after-db.json>");
  }

  const [summary, before, after] = await Promise.all([
    jsonFile<K6Summary>(summaryPath),
    jsonFile<DbSnapshot>(beforePath),
    jsonFile<DbSnapshot>(afterPath),
  ]);

  const errorRate = metric(summary, "http_req_failed", "rate");
  const unexpectedRate = metric(summary, "unexpected_failure", "rate");
  const p50 = metric(summary, "http_req_duration", "med");
  const p95 = metric(summary, "http_req_duration", "p(95)");
  const p99 = metric(summary, "http_req_duration", "p(99)");
  const deadlocksDelta = dbStat(after, "deadlocks") - dbStat(before, "deadlocks");
  const tempBytesDelta = dbStat(after, "temp_bytes") - dbStat(before, "temp_bytes");
  const rollbackDelta = dbStat(after, "xact_rollback") - dbStat(before, "xact_rollback");
  const waitingLocks = number(after.waitingLocks ?? 0);

  const checks = [
    { name: "unexpected request failure rate < 1%", pass: Number.isFinite(errorRate) && errorRate < 0.01, value: errorRate },
    { name: "business/harness unexpected failure rate < 1%", pass: Number.isFinite(unexpectedRate) && unexpectedRate < 0.01, value: unexpectedRate },
    { name: "global HTTP p95 screening threshold < 2000 ms", pass: Number.isFinite(p95) && p95 < 2000, value: p95 },
    { name: "no new database deadlocks", pass: Number.isFinite(deadlocksDelta) && deadlocksDelta === 0, value: deadlocksDelta },
    { name: "no lock wait remains after the run", pass: Number.isFinite(waitingLocks) && waitingLocks === 0, value: waitingLocks },
  ];

  const pass = checks.every((item) => item.pass);
  const output = {
    verdict: pass ? "SCREENING PASS — eligible to consider the next tier" : "STOP — investigate before any higher tier",
    note: "This screening verdict is not the final Performance Gate. Wallet/storage/business correctness and operation-specific budgets remain mandatory.",
    latencyMs: { p50, p95, p99 },
    rates: { httpReqFailed: errorRate, unexpectedFailure: unexpectedRate },
    database: {
      connectionsBefore: connectionCount(before),
      connectionsAfter: connectionCount(after),
      deadlocksDelta,
      rollbackDelta,
      tempBytesDelta,
      waitingLocksAfter: waitingLocks,
    },
    checks,
    topStatementDeltas: statementDeltas(before, after),
    topTableScanDeltas: tableDeltas(before, after),
  };

  console.log(JSON.stringify(output, null, 2));
  if (!pass) process.exitCode = 2;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Performance evaluation failed.");
  process.exit(1);
});
