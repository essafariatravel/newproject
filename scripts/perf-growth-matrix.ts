import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

type Query = { name: string; p95Ms: number };
type Benchmark = { datasetId: string; datasetRows: number; queries: Query[] };

async function read(path: string): Promise<Benchmark> {
  return JSON.parse(await readFile(path, "utf8")) as Benchmark;
}

function classify(alpha: number): string {
  if (!Number.isFinite(alpha)) return "insufficient";
  if (alpha <= 0.25) return "near-flat";
  if (alpha <= 0.75) return "sublinear";
  if (alpha <= 1.25) return "roughly-linear";
  return "superlinear-review";
}

async function main() {
  const paths = process.argv.slice(2);
  if (paths.length < 2) throw new Error("Usage: npm run perf:growth -- <benchmark-small.json> <benchmark-medium.json> [benchmark-large.json]");
  const runs = (await Promise.all(paths.map(read))).sort((a, b) => a.datasetRows - b.datasetRows);
  const names = [...new Set(runs.flatMap((run) => run.queries.map((q) => q.name)))].sort();
  const rows = names.map((name) => {
    const samples = runs.map((run) => ({
      datasetId: run.datasetId,
      datasetRows: run.datasetRows,
      p95Ms: run.queries.find((q) => q.name === name)?.p95Ms ?? Number.NaN,
    })).filter((sample) => Number.isFinite(sample.p95Ms) && sample.p95Ms > 0);
    const first = samples[0], last = samples.at(-1);
    let alpha = Number.NaN;
    if (first && last && last.datasetRows > first.datasetRows && last.p95Ms > 0 && first.p95Ms > 0) {
      alpha = Math.log(last.p95Ms / first.p95Ms) / Math.log(last.datasetRows / first.datasetRows);
    }
    return { name, alpha, classification: classify(alpha), samples };
  });
  const review = rows.filter((row) => row.classification === "superlinear-review");
  const output = {
    datasets: runs.map((run) => ({ id: run.datasetId, rows: run.datasetRows })),
    queries: rows,
    review: review.map((row) => row.name),
    note: "Growth classification is evidence triage, not an asymptotic proof. Re-run noisy/very-fast queries before optimizing.",
  };
  const serialized = JSON.stringify(output, null, 2);
  if (process.env.PERF_GROWTH_OUTPUT) {
    const file = resolve(process.env.PERF_GROWTH_OUTPUT);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, serialized, { mode: 0o600 });
  }
  console.log(serialized);
  if (review.length) process.exitCode = 2;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Growth matrix failed.");
  process.exit(1);
});
