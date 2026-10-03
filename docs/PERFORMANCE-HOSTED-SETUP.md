# ESSAFARIA VISA OS — Hosted Preview Performance Setup

Status: **execution handoff**  
Production authorization: **NONE**  
Target: isolated Preview deployment + `visa_os_preview` only

This document removes the remaining manual setup ambiguity before the hosted Performance Gate.

## 1. Required GitHub configuration

The reusable workflow is:

`.github/workflows/perf-hosted-preview.yml`

It intentionally contains **no credentials**.

Configure these values in the GitHub repository before running it.

### Required secret — PERF_PREVIEW_DATABASE_URL

Value:

- the approved Preview PostgreSQL transaction-pooler connection string;
- must target the recorded ESSAFARIA Supabase project `xgetzgixalrsmuvfthpf`;
- database schema is forced separately to `visa_os_preview`.

The central safety guard rejects:

- Production schema `visa_os`;
- an unexpected remote schema;
- a remote database that does not resolve to the recorded Supabase project.

Never paste this secret into a PR, issue, workflow log or documentation file.

### Required secret — PERF_SYNTHETIC_PASSWORD

A dedicated password used only to create/validate synthetic `perf.*@load.example` identities.

Requirements enforced by the seeder:

- minimum 16 characters;
- never printed by the scripts;
- not reused for real staff or agency accounts.

### Required repository variable — PERF_PREVIEW_BASE_URL

Value:

- the exact deployed Preview origin to exercise;
- for example an approved Vercel Preview URL.

The workflow and k6 harness refuse:

`https://visa.essafariavoyages.com`

Do not set the Production custom domain here.

## 2. Optional hosted storage proof

The workflow defaults `run_storage_correctness=false`.

Enable it only after declaring the actual Preview storage provider.

### If Preview uses database storage

Repository variable:

`PERF_STORAGE_PROVIDER=db`

No storage service-role secret is required.

### If Preview uses Supabase Storage

Repository variable:

`PERF_STORAGE_PROVIDER=supabase`

Secrets:

- `PERF_SUPABASE_URL`
- `PERF_SUPABASE_SERVICE_ROLE_KEY`

Optional repository variable:

- `PERF_SUPABASE_STORAGE_BUCKET`

The service-role key is server-only and must never appear in source control or logs.

## 3. First hosted run

Do not start at a high tier.

Recommended first dispatch:

- profile: `smoke`
- VUs: `10`
- hold: `5m`
- seed applications: `1000`
- existing dataset ID: empty
- wallet correctness: enabled
- storage correctness: disabled until provider is confirmed

The workflow performs:

1. anti-Production validation;
2. Preview health/database preflight;
3. synthetic identity validation;
4. optional isolated synthetic data creation;
5. distinct session creation;
6. DB before snapshot;
7. concurrent live DB wait/connection monitoring;
8. k6 execution;
9. DB after snapshot;
10. optional benchmark + EXPLAIN + index advisor on the selected synthetic dataset;
11. hosted wallet correctness;
12. optional real-provider storage correctness;
13. deterministic evaluation;
14. artifact upload;
15. fail/pass enforcement.

## 4. Tier progression

Allowed tier values:

`10 → 50 → 100 → 250 → 500 → 1000`

Never schedule all tiers automatically.

For each tier:

1. dispatch exactly one tier;
2. inspect the generated evaluation and DB monitor;
3. require zero correctness failure;
4. require no new deadlock;
5. require no residual lock wait;
6. require global and observed per-operation budgets to pass;
7. investigate any failure before considering a higher tier.

A successful tier authorizes consideration of the next tier only. It does not predict that the next tier will pass.

## 5. Polling-only run

After a normal passing tier, dispatch:

- profile: `polling-only`;
- VUs: the tier being investigated;
- hold: normally `10m`.

This isolates:

- notification polling every 15 seconds;
- presence every 45 seconds;
- session validity every 60 seconds.

At 500 active tabs the current intervals imply roughly 52.8 background requests/second before user navigation. At 1000 tabs they imply roughly 105.6 requests/second.

Use the DB monitor and pg_stat_statements evidence before changing polling intervals or adding indexes.

## 6. Export run

Dispatch:

- profile: `exports`.

The dedicated workload exercises:

- applications CSV;
- applications XLSX;
- reports CSV;
- reports XLSX.

Correlate k6 latency/response size with Vercel runtime and memory evidence.

Do not move exports to asynchronous processing merely because a direct DB aggregate grows with dataset size. Make that change only if the hosted serialization/runtime evidence justifies it.

## 7. Recovery run

After a spike or a tier that approached a limit, dispatch:

- profile: `recovery`;
- hold: `10m`.

The target is to show that request latency, DB connections and waits return to the low-load baseline.

A platform that survives the peak but remains degraded afterwards has not passed recovery.

## 8. Current local evidence to reuse

Do not repeat the local discovery work unless the relevant query/schema changes.

See:

`docs/PERFORMANCE-GATE-LOCAL-EVIDENCE.md`

Already demonstrated on disposable PostgreSQL through 100k applications:

- stable agency first-page and broad-search DB reads;
- visible but bounded deep OFFSET growth;
- roughly linear report growth;
- audit deep-page/temp-I/O pressure;
- polling-sensitive unread-count growth;
- exact-shape index A/B experiments.

### Communications index

Status:

`PROVEN_LOCAL_CANDIDATE`

Candidate:

`perf/candidates/communications-created.sql`

Symmetric A/B local evidence at 100k:

- before p95 ~20.49 ms;
- after p95 ~0.53 ms;
- ~38.44x speedup.

Do not promote it solely from local evidence. Validate the staff communications path on hosted Preview first.

### Unread notification partial index

Status:

`DEFER`

Controlled symmetric A/B:

- before p95 ~29.56 ms;
- after p95 ~30.84 ms.

No repeatable benefit was demonstrated, so there is intentionally no executable candidate SQL file anymore.

## 9. Artifact interpretation

A hosted run should retain:

- `hosted-before.json`
- `hosted-after.json`
- `hosted-db-monitor.json`
- `hosted-k6-summary.json`
- `hosted-evaluation.json`
- optional `hosted-query-benchmark.json`
- optional `hosted-explain.json`
- optional `hosted-index-advisor.json`

Do not report only VU count.

The capacity statement must include at least:

- tested commit;
- tested Preview origin/environment;
- VU tier;
- actual requests/second;
- p50/p95/p99;
- request/error rates;
- operation budget failures;
- DB connection/wait/deadlock evidence;
- wallet/storage correctness state;
- recovery state.

## 10. Final report

After all approved tiers:

1. copy `perf/report-input.example.json`;
2. reference only the exact passing/failing run artifacts;
3. mark wallet/storage correctness true only when those hosted suites actually passed;
4. run `npm run perf:report`.

The generator deliberately refuses to infer capacity above the highest demonstrated passing tier.

## 11. What Codex still has to do

Once the three required GitHub values exist, Codex should not design new load tooling.

Its remaining role is:

1. verify the Preview deployment corresponds to the tested Performance branch commit;
2. dispatch smoke;
3. dispatch one approved tier at a time;
4. correlate Vercel and PostgreSQL evidence;
5. run polling-only, exports and recovery where applicable;
6. validate the communications index on Preview only if communications is material;
7. apply only evidence-backed optimization;
8. rerun the failed scenario plus the previous passing tier;
9. generate the final report.

Everything else in this Performance Gate is already prepared and locally verified.
