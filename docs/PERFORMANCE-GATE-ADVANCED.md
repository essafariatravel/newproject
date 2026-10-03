# Performance Gate — Advanced Execution Addendum

This addendum documents the advanced tooling added after the base Performance Gate pack. All tools are non-Production only and reuse the central fail-closed safety guard where database access is involved.

## Operation budgets

`perf/budgets.json` is the source of truth for global error/p95 budgets, per-operation p95/p99 budgets and regression thresholds.

The k6 harness emits dedicated `op_<operation>` Trends only for operations actually exercised. The evaluator fails promotion when any observed operation exceeds its budget.

## Polling isolation

Run background traffic without foreground navigation:

```bash
PERF_PROFILE=polling-only PERF_VUS=500 PERF_HOLD=10m npm run perf:k6
```

This isolates notifications (15 s), presence (45 s) and session checks (60 s).

## Recovery

After a spike, run an independent recovery sample:

```bash
PERF_PROFILE=recovery PERF_HOLD=10m npm run perf:k6
```

The spike profile itself also drops to 10 VUs for 10 minutes before ramp-down.

## Live database monitor

Run alongside k6:

```bash
PERF_MONITOR_SECONDS=1200 \
PERF_MONITOR_INTERVAL_MS=1000 \
PERF_MONITOR_OUTPUT=perf/results/db-monitor.json \
npm run perf:monitor
```

It records active/idle/total connections, wait events and lock waiters, including maxima during the run.

## Query benchmark

For a seeded synthetic dataset:

```bash
PERF_DATASET_ID=scale10k PERF_BENCH_REPEATS=7 npm run perf:benchmark
```

Coverage includes application lists, broad search, multiple OFFSET depths, export-size queries, reports, audit, notifications, communications, documents and wallet aggregation.

## EXPLAIN ANALYZE / BUFFERS

Only after confirming the non-Production target:

```bash
PERF_ALLOW_EXPLAIN_ANALYZE=YES \
PERF_DATASET_ID=scale10k \
npm run perf:explain
```

The read-only diagnostic flags large sequential scans, disk/temp I/O, large nested loops, cardinality misestimates and slow execution. It never creates an index automatically.

## 1k / 10k / 100k matrix

Use GitHub Actions workflow:

`.github/workflows/perf-scale-matrix.yml`

It runs only against disposable local PostgreSQL and supports maximum dataset selections of 1k, 10k or 100k applications. Benchmark and EXPLAIN artifacts are uploaded for later analysis.

Compare local benchmark artifacts with:

```bash
npm run perf:growth -- \
  perf/results/query-benchmark-scale1000.json \
  perf/results/query-benchmark-scale10000.json \
  perf/results/query-benchmark-scale100000.json
```

The growth helper classifies evidence as near-flat, sublinear, roughly-linear or superlinear-review. It is triage evidence, not an asymptotic proof.

## Regression detection

```bash
npm run perf:regression -- baseline.json candidate.json
```

Current policy:

- >=15% p95 regression: WARN
- >=25% p95 regression: FAIL

It supports both query benchmark files and k6 summaries.

## Export workload

```bash
PERF_EXPORT_ITERATIONS=8 npm run perf:exports
```

This separately exercises applications CSV/XLSX and reports CSV/XLSX, recording latency and response size. Hosted results must be correlated with Vercel runtime/memory evidence before deciding whether asynchronous exports are needed.

## Automatic final report

Copy `perf/report-input.example.json`, replace it with the exact run artifacts, then execute:

```bash
npm run perf:report -- \
  perf/results/report-manifest.json \
  perf/results/PERFORMANCE-GATE-REPORT.md
```

The report contains VUs, actual request rate, p50/p95/p99, errors, operation budget failures, DB lock/deadlock evidence, wallet/storage correctness and exact non-inference capacity wording.

## Final execution-agent scope

The final agent should not redesign the performance methodology. It should:

1. reconcile the Performance Gate PR with the final hardening HEAD if needed;
2. obtain authorized hosted Preview access;
3. run preflight;
4. run the disposable scale matrix at the required sizes;
5. review benchmark + EXPLAIN evidence;
6. execute load tiers one at a time;
7. run the DB monitor alongside hosted load;
8. isolate polling if it is material;
9. exercise export paths;
10. run hosted wallet/storage correctness suites;
11. optimize only measured bottlenecks;
12. compare against baseline;
13. run recovery;
14. run final regression;
15. generate the final report.

No Production load testing is authorized by this pack.
