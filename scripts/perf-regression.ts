import { readFile } from "node:fs/promises";

type Benchmark = { datasetId?: string; datasetRows?: number; queries?: Array<{ name: string; p95Ms: number; p99Ms?: number }> };
type K6Metric = { values?: Record<string, number> };
type K6Summary = { metrics?: Record<string, K6Metric> };
type BudgetFile = { regression: { warnPct: number; failPct: number } };

async function json<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

function pct(base: number, candidate: number): number {
  if (!Number.isFinite(base) || base <= 0 || !Number.isFinite(candidate)) return Number.NaN;
  return ((candidate - base) / base) * 100;
}

function isBenchmark(value: Benchmark | K6Summary): value is Benchmark {
  return Array.isArray((value as Benchmark).queries);
}

function operationMetrics(summary: K6Summary) {
  const result = new Map<string, { p95: number; p99: number }>();
  for (const [name, metric] of Object.entries(summary.metrics ?? {})) {
    const match = name.match(/^http_req_duration\{operation:([^}]+)\}$/);
    if (!match) continue;
    result.set(match[1]!, {
      p95: Number(metric.values?.["p(95)"] ?? Number.NaN),
      p99: Number(metric.values?.["p(99)"] ?? Number.NaN),
    });
  }
  return result;
}

async function main() {
  const [baselinePath, candidatePath] = process.argv.slice(2);
  if (!baselinePath || !candidatePath) throw new Error("Usage: npm run perf:regression -- <baseline.json> <candidate.json>");
  const budgets = await json<BudgetFile>("perf/budgets.json");
  const [baseline, candidate] = await Promise.all([
    json<Benchmark | K6Summary>(baselinePath),
    json<Benchmark | K6Summary>(candidatePath),
  ]);

  const comparisons: Array<{ name: string; baseline: number; candidate: number; deltaPct: number; status: "PASS" | "WARN" | "FAIL" }> = [];

  if (isBenchmark(baseline) && isBenchmark(candidate)) {
    const old = new Map((baseline.queries ?? []).map((q) => [q.name, q]));
    for (const q of candidate.queries ?? []) {
      const prior = old.get(q.name);
      if (!prior) continue;
      const deltaPct = pct(prior.p95Ms, q.p95Ms);
      const status = deltaPct >= budgets.regression.failPct ? "FAIL" : deltaPct >= budgets.regression.warnPct ? "WARN" : "PASS";
      comparisons.push({ name: q.name, baseline: prior.p95Ms, candidate: q.p95Ms, deltaPct, status });
    }
  } else if (!isBenchmark(baseline) && !isBenchmark(candidate)) {
    const old = operationMetrics(baseline);
    const next = operationMetrics(candidate);
    for (const [name, values] of next) {
      const prior = old.get(name);
      if (!prior) continue;
      const deltaPct = pct(prior.p95, values.p95);
      const status = deltaPct >= budgets.regression.failPct ? "FAIL" : deltaPct >= budgets.regression.warnPct ? "WARN" : "PASS";
      comparisons.push({ name, baseline: prior.p95, candidate: values.p95, deltaPct, status });
    }
  } else {
    throw new Error("Baseline and candidate must both be query benchmarks or both be k6 summaries.");
  }

  const failed = comparisons.filter((item) => item.status === "FAIL");
  const warned = comparisons.filter((item) => item.status === "WARN");
  console.log(JSON.stringify({
    verdict: failed.length ? "REGRESSION FAIL" : warned.length ? "REGRESSION WARN" : "REGRESSION PASS",
    warnPct: budgets.regression.warnPct,
    failPct: budgets.regression.failPct,
    comparisons: comparisons.sort((a, b) => b.deltaPct - a.deltaPct),
  }, null, 2));
  if (failed.length) process.exitCode = 2;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Regression comparison failed.");
  process.exit(1);
});
