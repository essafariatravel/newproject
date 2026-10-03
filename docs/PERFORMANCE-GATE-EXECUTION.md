# ESSAFARIA VISA OS — Performance Gate Execution Pack

Status: **prepared, non-Production only**

Prepared from hardening branch:

- source branch: `preprod/essafaria-final-hardening`
- source HEAD: `53dc61de334c6412c1e5337b4f745c360f69facd`
- preparation branch: `perf/performance-gate-prep`

This pack does not make a capacity claim. Its purpose is to make the eventual gate execution deterministic and small.

## 1. Absolute safety

Every database-connected performance script uses `scripts/perf-safety.ts`.

It refuses:

- `DATABASE_SCHEMA=visa_os`;
- `https://visa.essafariavoyages.com`;
- a remote DB outside Supabase project `xgetzgixalrsmuvfthpf`;
- a remote DB schema other than `visa_os_preview`;
- execution without `PERF_ACK_NONPROD=YES`.

The k6 harness independently performs the same application-side check through an **authenticated** `/api/health` call before workload starts. It requires:

- deployment environment is not `production`;
- schema is `visa_os_preview`;
- `database.intendedSupabaseProject === true`;
- health is ready.

There is no automatic 10→1000 run. Every tier is a separate operator decision.

## 2. What already exists in the product

The performance pack deliberately reuses the product's existing hardening instead of replacing it.

Observed implementation at the source HEAD:

- Vercel runtime PostgreSQL client pool: max 3 connections per function instance.
- Local/test pool: max 10.
- Supabase transaction pooler / port 6543 is explicitly supported and identified by the health route.
- Wallet debit is an atomic conditional update.
- Application charge has a partial unique index that allows one APPLICATION_CHARGE per application.
- Top-up processing takes a row lock and uses the same wallet mutation primitive.
- Notifications poll every 15 seconds only while the tab is visible.
- Presence posts every 45 seconds while visible.
- Session validity is checked every 60 seconds.
- Only real user interaction extends idle session activity.
- Staff idle timeout is 30 minutes; agency idle timeout is 2 hours.
- Document request upload is server-bounded to 2 MB.
- `pg_stat_statements` is enabled on the current Supabase project.

## 3. Current Preview baseline observed during preparation

Supabase project:

`xgetzgixalrsmuvfthpf`

Region:

`us-east-1`

Database engine observed:

PostgreSQL 17

Current `visa_os_preview` is a **small functional dataset**, not a capacity dataset.

Observed approximate rows while preparing this pack:

| Table | Rows |
| --- | ---: |
| agencies | 24 |
| users | 49 |
| applications | 46 |
| documents | 62 |
| wallet_transactions | 43 |
| notifications | 790 |
| communications | 3 |
| audit_logs | 559 |
| sessions | 51 |

Do not infer capacity from this dataset.

### Current database timing signal

At this small size, the hot queries observed through `pg_stat_statements` are fast:

- unread notification count: ~0.17 ms mean DB execution in the observed sample;
- basic notification list: ~0.21 ms mean DB execution;
- presence upsert: ~1 ms mean DB execution;
- session resolution queries are generally sub-millisecond to low-millisecond DB work;
- DB-backed document blob operations are materially heavier than simple reads and must remain a dedicated scenario.

These measurements are historical observations from the small Preview dataset. They are not performance budgets or load-test results.

## 4. Background request amplification

With visible browser tabs, current intervals imply approximately:

### 500 active browsers

- notifications: 500 / 15 = **33.3 req/s**
- presence: 500 / 45 = **11.1 req/s**
- session check: 500 / 60 = **8.3 req/s**

Total periodic background traffic:

**~52.8 req/s**

before ordinary navigation.

### 1000 active browsers

- notifications: **66.7 req/s**
- presence: **22.2 req/s**
- session check: **16.7 req/s**

Total:

**~105.6 req/s**

before ordinary navigation.

Therefore polling is a first-class measured workload dimension, but it must not be redesigned unless the tests show it is a bottleneck.

## 5. Candidate database issues — NOT fixes yet

Supabase's performance advisor currently flags multiple foreign keys without covering indexes.

Potentially relevant candidates include:

- applications: `assigned_to`, `country_id`, `created_by`, `override_by`, `priority_id`, `visa_type_id`;
- notifications: `agency_id`, `application_id`;
- audit_logs: `actor_id`;
- documents: applicant/checklist/document-type/reviewer/uploader foreign keys;
- application status history actor/status foreign keys.

Do **not** add all these indexes.

The current small dataset does not demonstrate that they are bottlenecks. Add an index only when scaled workload + query plan/statement evidence demonstrates a useful read path and write/storage cost remains justified.

A possible unread-notification partial index is also only a candidate. The observed unread COUNT is currently fast.

## 6. Files in this pack

### Safety / preparation

`scripts/perf-safety.ts`

Central fail-closed target guard.

`scripts/perf-preflight.ts`

Checks Preview health, DB identity, migration count, current dataset counts, pg_stat_statements availability and PERF identities.

`scripts/perf-seed-identities.ts`

Creates only six dedicated synthetic identities plus one synthetic agency:

- PERF SUPER_ADMIN
- PERF ADMIN
- PERF VISA_AGENT
- PERF ACCOUNTING
- PERF AGENCY_ADMIN
- PERF AGENCY_USER

Existing identities are never overwritten or silently reactivated.

`scripts/perf-create-sessions.ts`

Creates opaque sessions for load simulation. Raw tokens are written only to a gitignored file with restrictive permissions and never printed.

`scripts/perf-seed-scale.ts`

Creates configurable synthetic scale data:

- agencies;
- applications;
- one traveller per application;
- checklist/document metadata without large blobs;
- notifications;
- communications;
- audit events;
- status history;
- a coherent synthetic credit ledger.

Bulk remote seeding is disabled unless separately acknowledged.

`scripts/perf-db-snapshot.ts`

Captures before/after DB evidence:

- connections;
- DB counters/deadlocks/temp usage;
- table scans/live/dead tuples/size;
- index usage;
- waiting locks;
- top pg_stat_statements entries.

### Workload

`perf/k6/essafaria-load.js`

HTTP workload with the actual persona ratios and current periodic background traffic.

Profiles:

- `smoke`
- `normal`
- `peak`
- `spike`
- `soak-agency`
- `soak-mixed-short`
- `tier`

`tier` accepts only:

10, 50, 100, 250, 500, 1000 VUs.

### Correctness tests

`tests/performance-safety.test.ts`

Proves the safety guard refuses Production.

`tests/performance-wallet-races.test.ts`

Adds:

- 50 concurrent attempts against the same application → exactly one charge;
- 50 different concurrent submissions with funds for only 10 → exactly 10 successful debits and no negative balance.

`tests/performance-storage-concurrency.test.ts`

Persists, retrieves, verifies and deletes 20 concurrent synthetic 2 MB objects using the configured storage abstraction in the test environment.

## 7. Runtime secrets and result hygiene

`perf/.gitignore` excludes:

- `perf/.runtime/`
- `perf/results/`
- summary JSON

Never commit the session-token file.

Never print it.

## 8. Preparation commands

These commands are examples for the isolated test environment.

### A. Common acknowledgement

```bash
export PERF_ACK_NONPROD=YES
export DATABASE_SCHEMA=visa_os_preview
export BASE_URL="https://<CURRENT-PREVIEW-DEPLOYMENT>"
```

DATABASE_URL must be injected from the approved Preview environment. Do not paste it into reports or chat.

### B. Create synthetic identities

```bash
export PERF_SYNTHETIC_PASSWORD="<generated-local-secret-at-least-16-chars>"
npx tsx scripts/perf-seed-identities.ts
```

### C. Create synthetic sessions

For smoke/normal runs:

```bash
export PERF_SESSIONS_PER_ROLE=50
npx tsx scripts/perf-create-sessions.ts
```

For a 1000-VU tier, generate enough distinct sessions before the run. A conservative simple setting is 500 per role.

### D. Preflight

```bash
npx tsx scripts/perf-preflight.ts
```

### E. Snapshot before a tier

```bash
export PERF_LABEL=before-smoke
npx tsx scripts/perf-db-snapshot.ts
```

### F. Run k6 smoke

```bash
PERF_PROFILE=smoke \
PERF_SESSION_FILE=./perf/.runtime/sessions.json \
k6 run perf/k6/essafaria-load.js
```

### G. Snapshot after

```bash
export PERF_LABEL=after-smoke
npx tsx scripts/perf-db-snapshot.ts
```

Only advance after evaluating the run and DB evidence.

## 9. Tier execution

Example:

```bash
PERF_PROFILE=tier PERF_VUS=50 PERF_RAMP=5m PERF_HOLD=15m \
PERF_SESSION_FILE=./perf/.runtime/sessions.json \
k6 run perf/k6/essafaria-load.js
```

Then 100, 250, 500 and 1000 **only when the previous level passes**.

No script in this pack automatically escalates.

## 10. Session caveat for soak tests

HTTP reads/background polling do not count as user activity in ESSAFARIA's security model.

Therefore:

- a pure HTTP mixed staff test must stay below the 30-minute staff idle timeout unless true interaction-touch behaviour is simulated;
- `soak-mixed-short` is intentionally 25 minutes;
- `soak-agency` is 60 minutes because agency idle timeout is 2 hours.

Do not “fix” this by artificially extending staff sessions in application code. The security policy is authoritative.

For a true long staff soak, use a browser-capable interaction harness or explicitly exercise the same interaction action semantics in an approved test-only method.

## 11. Synthetic scale datasets

The current Preview dataset is too small for 10k/100k query analysis.

Prefer an isolated local database or disposable database branch for the large data profiles.

Example local/isolated 10k profile:

```bash
export PERF_DATASET_ID=scale10k
export PERF_APPLICATIONS=10000
export PERF_AGENCIES=100
export PERF_DOCS_PER_APP=5
export PERF_NOTIFICATIONS_PER_APP=4
export PERF_MESSAGES_PER_APP=1
export PERF_AUDITS_PER_APP=4
export PERF_LEDGER_ROWS=10000
npx tsx scripts/perf-seed-scale.ts
```

For a remote non-Production database the script additionally requires:

```bash
export PERF_ALLOW_REMOTE_BULK=YES
```

Above 10k remote applications it also requires:

```bash
export PERF_ALLOW_LARGE_REMOTE_BULK=YES
```

Those variables are deliberate friction. Do not set them reflexively.

The scale seeder is append-only. It never deletes audit/ledger history. Use a unique `PERF_DATASET_ID` for each disposable dataset.

## 12. Storage test interpretation

The current product supports database bytea storage and optional Supabase Storage.

The unit/integration concurrency test validates the storage abstraction against the normal test provider.

The hosted gate must separately identify the actual Preview `STORAGE_PROVIDER` and run the 2 MB upload/download scenario against that provider.

Do not infer Supabase Storage performance from DB-bytea test results or vice versa.

## 13. What remains for the final execution agent

After this preparation, Codex should **not** perform a general performance audit.

Its remaining work is limited to:

1. compare the final hardening HEAD/report with this branch;
2. rebase/cherry-pick this additive pack onto the final hardening HEAD if it moved;
3. resolve the current hosted Preview deployment and approved test DB;
4. run the preflight;
5. use an isolated large synthetic dataset where required;
6. execute smoke → next tier only after PASS;
7. correlate k6 output with Vercel + DB metrics;
8. identify the first measured bottleneck;
9. make the smallest justified optimization;
10. rerun only the failed scenario + previous passing tier;
11. run wallet/storage correctness scenarios;
12. run one full authoritative regression suite at the end;
13. issue the measured gate report.

Codex must not spend tokens rediscovering polling intervals, wallet locking, existing indexes, current DB pool configuration, harness design, persona mix, safety rules, or synthetic-data shape. They are already captured here.

## 14. Capacity wording

Never state:

“ESSAFARIA supports 1000 concurrent users”

unless that exact workload was demonstrated.

If 250 passes and 500 fails, report:

“250 concurrent VUs were demonstrated under the reported workload/environment. The 500-VU tier failed because of the measured bottleneck. Capacity between 250 and 500 was not tested.”

Always report actual throughput together with VUs.
