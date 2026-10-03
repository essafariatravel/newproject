import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

type K6Metric = { values?: Record<string, number>; thresholds?: Record<string, { ok: boolean }> };
type K6Summary = { metrics?: Record<string, K6Metric> };
type DbSnapshot = { waitingLocks?: number; databaseStats?: Array<Record<string, unknown>> };
type ManifestRun = {
  label: string;
  vus: number;
  summary: string;
  beforeDb: string;
  afterDb: string;
};
type Manifest = {
  environment: string;
  commit: string;
  walletCorrectness: boolean;
  storageCorrectness: boolean;
  runs: ManifestRun[];
  notes?: string[];
};
type BudgetFile = {
  global: { p95Ms: number; errorRateMax: number; unexpectedFailureRateMax: number };
  operations: Record<string, { p95Ms: number; p99Ms: number }>;
};

async function json<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}
function num(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value !== "") return Number(value);
  return Number.NaN;
}
function metric(summary: K6Summary, key: string, value: string): number {
  return num(summary.metrics?.[key]?.values?.[value]);
}
function dbStat(snapshot: DbSnapshot, key: string): number {
  return num(snapshot.databaseStats?.[0]?.[key]);
}
function operationRows(summary: K6Summary, budgets: BudgetFile) {
  const rows = [];
  for (const [operation, budget] of Object.entries(budgets.operations)) {
    const m = summary.metrics?.[`op_${operation}`]
      ?? summary.metrics?.[`http_req_duration{operation:${operation}}`];
    if (!m) continue;
    const p95 = num(m.values?.["p(95)"]);
    const p99 = num(m.values?.["p(99)"]);
    rows.push({
      operation,
      p95,
      p99,
      p95Budget: budget.p95Ms,
      p99Budget: budget.p99Ms,
      pass: p95 <= budget.p95Ms && p99 <= budget.p99Ms,
    });
  }
  return rows;
}
function fmt(n: number, digits = 1): string {
  return Number.isFinite(n) ? n.toFixed(digits) : "n/a";
}

async function main() {
  const manifestPath = process.argv[2];
  if (!manifestPath) throw new Error("Usage: npm run perf:report -- <report-manifest.json> [output.md]");
  const outputPath = resolve(process.argv[3] ?? "perf/results/PERFORMANCE-GATE-REPORT.md");
  const [manifest, budgets] = await Promise.all([json<Manifest>(manifestPath), json<BudgetFile>("perf/budgets.json")]);

  const evaluated = [];
  for (const run of manifest.runs) {
    const [summary, before, after] = await Promise.all([
      json<K6Summary>(run.summary),
      json<DbSnapshot>(run.beforeDb),
      json<DbSnapshot>(run.afterDb),
    ]);
    const p50 = metric(summary, "http_req_duration", "med");
    const p95 = metric(summary, "http_req_duration", "p(95)");
    const p99 = metric(summary, "http_req_duration", "p(99)");
    const reqRate = metric(summary, "http_reqs", "rate");
    const errorRate = metric(summary, "http_req_failed", "rate");
    const unexpected = metric(summary, "unexpected_failure", "rate");
    const deadlocks = dbStat(after, "deadlocks") - dbStat(before, "deadlocks");
    const waitingLocks = num(after.waitingLocks ?? 0);
    const ops = operationRows(summary, budgets);
    const opFailures = ops.filter((op) => !op.pass);
    const pass =
      errorRate < budgets.global.errorRateMax &&
      unexpected < budgets.global.unexpectedFailureRateMax &&
      p95 < budgets.global.p95Ms &&
      deadlocks === 0 &&
      waitingLocks === 0 &&
      opFailures.length === 0;
    evaluated.push({ ...run, p50, p95, p99, reqRate, errorRate, unexpected, deadlocks, waitingLocks, ops, opFailures, pass });
  }

  const passing = evaluated.filter((run) => run.pass).sort((a, b) => a.vus - b.vus);
  const failing = evaluated.filter((run) => !run.pass).sort((a, b) => a.vus - b.vus);
  const highest = passing.at(-1);
  let verdict = "PERFORMANCE GATE FAIL";
  if (manifest.walletCorrectness && manifest.storageCorrectness && highest) {
    verdict = highest.vus >= 1000 && failing.length === 0
      ? "PERFORMANCE GATE PASS"
      : `PERFORMANCE GATE PASS WITH CAPACITY LIMIT — ${highest.vus} VUs demonstrated`;
  }

  const lines: string[] = [];
  lines.push("# ESSAFARIA VISA OS — Performance Gate Report", "");
  lines.push(`**Verdict: ${verdict}**`, "");
  lines.push(`Environment: ${manifest.environment}`);
  lines.push(`Commit: \`${manifest.commit}\``);
  lines.push(`Wallet correctness: ${manifest.walletCorrectness ? "PASS" : "FAIL / NOT PROVEN"}`);
  lines.push(`Storage correctness: ${manifest.storageCorrectness ? "PASS" : "FAIL / NOT PROVEN"}`, "");
  lines.push("## Load tiers", "");
  lines.push("| Tier | VUs | Actual req/s | p50 ms | p95 ms | p99 ms | Errors | Operation budget failures | Result |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |");
  for (const run of evaluated.sort((a, b) => a.vus - b.vus)) {
    lines.push(`| ${run.label} | ${run.vus} | ${fmt(run.reqRate,2)} | ${fmt(run.p50)} | ${fmt(run.p95)} | ${fmt(run.p99)} | ${fmt(run.errorRate * 100,2)}% | ${run.opFailures.length} | ${run.pass ? "PASS" : "FAIL"} |`);
  }
  lines.push("", "## Operation budget failures", "");
  const failures = evaluated.flatMap((run) => run.opFailures.map((op) => ({ tier: run.label, ...op })));
  if (!failures.length) lines.push("None in the supplied runs.");
  else {
    lines.push("| Tier | Operation | p95 / budget | p99 / budget |", "| --- | --- | ---: | ---: |");
    for (const item of failures) {
      lines.push(`| ${item.tier} | ${item.operation} | ${fmt(item.p95)} / ${item.p95Budget} | ${fmt(item.p99)} / ${item.p99Budget} |`);
    }
  }
  lines.push("", "## Capacity statement", "");
  if (highest) {
    lines.push(`${highest.vus} concurrent VUs were demonstrated under the reported workload/environment at ${fmt(highest.reqRate,2)} actual requests/second.`);
    const firstFailureAbove = failing.find((run) => run.vus > highest.vus);
    if (firstFailureAbove) {
      lines.push(`The ${firstFailureAbove.vus}-VU tier failed. Capacity between ${highest.vus} and ${firstFailureAbove.vus} VUs was not measured and must not be inferred.`);
    } else {
      lines.push("No capacity above the highest demonstrated tier is claimed.");
    }
  } else {
    lines.push("No passing load tier was demonstrated from the supplied evidence.");
  }
  if (manifest.notes?.length) {
    lines.push("", "## Notes", "");
    for (const note of manifest.notes) lines.push(`- ${note}`);
  }
  lines.push("", "This report is generated from measured k6 and PostgreSQL evidence. It does not infer untested capacity.", "");
  await writeFile(outputPath, lines.join("\n"), "utf8");
  console.log(JSON.stringify({ verdict, outputPath, highestPassingVus: highest?.vus ?? null }, null, 2));
  if (verdict === "PERFORMANCE GATE FAIL") process.exitCode = 2;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Performance report generation failed.");
  process.exit(1);
});
