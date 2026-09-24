# PRODUCTION PRE-FLIGHT REPORT — release 0013 → 0017

**Prepared:** 2026-09-24 · **Mode:** READ-ONLY (nothing was written to Production, nothing deployed, no credential changed)
**Verdict:** 🟢 **READY** — fresh read-only audit reports `PREFLIGHT VERDICT: READY`; the write path is disarmed and **awaits explicit authorization**.
**Status:** ⛔ **STOPPED before the first Production write** (no `release/PROD_GO`, no apply, no deploy).

---

## 1. Exact release commit

| | |
|---|---|
| **Release commit (tooling + guard tests)** | `5d5418e` — *release(tooling): prepare the 0013-0017 Production release (still disarmed)* |
| **Owner-verified application baseline** | `8f04bb0` (hosted Preview gate 35/0, hosted E2E 119/0/1) |
| **App-code difference between the two** | **none** — `git diff 8f04bb0 5d5418e -- src migrations docs public package.json` = **0 files** |
| Files that differ | `scripts/prod-release.ts` (baseline + guards), `tests/prod-release-preflight.test.ts` (11 guard tests, all pass), `release/PROD_GO` (stale sentinel removed) |
| Branch | `arena/01a0ce58-newproject` (tip `5d5418e`), `main` = `3a1cdc9` which **is an ancestor** → fast-forward merge is possible |
| Migrations in the release | `0013_embassy_applicability.sql`, `0014_wallet_topup_requests.sql`, `0015_schema_safe_references.sql`, `0016_document_type_audience.sql`, `0017_decision_types_audience.sql` |

CI on the release commit: prod-release run **35994363318** → audit job **success**, apply job **SKIPPED** (no sentinel) ·
pre-prod-gate run **35994363289** → **SUCCESS** (35 checks, `LEDGER-PROD: released state through 0012 — untouched`).

## 2. Current Production commit

* `3a1cdc9` (main) — Vercel Production deployment **6619031743** (`success`, `newproject-it0xpwc3g-…`, author `vercel[bot]`, Git integration on `main`).
* Live corroboration from `https://…/api/health`: `ok:true`, region `iad1`, Supabase pooler `aws-1-us-east-1.pooler.supabase.com:6543`, `intendedSupabaseProject: true`, `connected: true`, schema `visa_os`, ledger 0001–0012.
* Production therefore runs the **pre-0013** app; the new code (`8f04bb0`) is not deployed yet.

## 3. Production schema and migration ledger

* Schema: **`visa_os`** — hard-pinned in the tooling (`DATABASE_SCHEMA` must literally equal `visa_os`; never derived).
* Target project identity verified by username guard: `postgres.xgetzgixalrsmuvfthpf` on the Supabase pooler (report line: *“targets the recorded project xgetzgixalrsmuvfthpf”*). No credential is printed.
* Ledger: **exactly 0001–0012 (12 migrations)**; `columnsValid: false (42703: column "agency_uploadable" does not exist)` — **expected pre-release**, this is precisely what 0016 adds.
* Pending set computed from the repository = exactly the 5 release files — no extra migration can ride along on this authorization.

## 4. Migrations that would be applied (5, in order)

| # | Migration | Effect |
|---|---|---|
| 0013 | `embassy_applicability` | `visa_types.embassy_applicability` text NOT NULL default `'OPTIONAL'` + CHECK + index — pure additive |
| 0014 | `wallet_topup_requests` | new table + constraints/indexes (unique `reference`, partial unique `wallet_tx_id`, one PENDING per agency), sequences + `updated_at` trigger — additive |
| 0015 | `schema_safe_references` | references assigned by BEFORE INSERT triggers instead of column defaults; drops **only** the two `DEFAULT` clauses on the reference columns; resyncs counters with `setval ≥ max(stored)` |
| 0016 | `document_type_audience` | `document_types.agency_uploadable` default true; `DECISION_VISA_APPROVAL` / `DECISION_REJECTION` → `false` |
| 0017 | `decision_types_audience` | all `code LIKE 'DECISION\_%'` → `false` (one-time guarded UPDATE) |

## 5. Migration safety findings

* **No destructive behaviour:** no `DROP TABLE`, no dropped columns, no `DELETE`/`TRUNCATE`, no data loss. The only drops are two column `DEFAULT` clauses (0015), replaced by triggers that assign the same values.
* **Idempotent & forward-only:** `IF NOT EXISTS` everywhere, guarded `UPDATE`s, previously applied files never edited.
* **Atomic:** the runner applies all pending files in **one transaction** under `pg_advisory_xact_lock(…,1)` with `lock_timeout 30s` / `statement_timeout 5min`; any error rolls the whole set back. A missing ledger on the target DB is refused (never bootstrapped).
* **Schema-safe:** 0015 creates and uses its sequences/functions inside `visa_os` only (`tg_table_schema`), verified on Preview (`REF: references are schema-local and collision-free, counter 103 ≥ max 103`).
* **Backward compatible:** the currently deployed app (`3a1cdc9`) keeps working after the migrations — its wallet inserts omit `reference` and now receive trigger-assigned values.
* **Ordering is mandatory:** the new app code requires the new columns; deploying it against the un-migrated schema fails with `42703`. ⇒ **apply migrations first, deploy code second** (steps in item 10).
* Migrations were rehearsed end-to-end on Preview (`visa_os_preview`, ledger through 0017) with the gate's 35 checks green, including `DOC-AUDIENCE` (decision documents staff-issued only; the 10 agency-provided types remain requestable; no checklist requires a staff-issued document).

## 6. Before-release integrity baseline (live, read-only, run 35994363318)

```
ledger 0001–0012 · columnsValid false (42703 agency_uploadable — expected)
counts: users 4, agencies 4, applications 2, applicants 2, notifications 29, communications 0,
        audit_logs 64, site_settings 13, documents 6, document_blobs 8, checklist_items 4,
        wallet_transactions 3, application_status_history 8
wallet ledger checksum: 8508159c7279636306f48efd9ddf30ac
agency balances checksum: 0f091712b9965c5802b0811bfe07acaa
status mix: {"APPROVED": 2} · remap exposure (0005/0006 sources): all 0
brand.name = "ESSAFARIA TRAVEL" (brand.description/logoKey/logoMime/logoVersion/product present)
approved-baseline comparison: MATCH — PREFLIGHT VERDICT: READY
```

This baseline is now the release tooling's approved baseline: the apply path refuses to run if the ledger, any protected count, either checksum, or the pending set differs (only append-only `audit_logs` may grow). The same 13-table snapshot logic produced the 0011+0012 release on 2026-09-23.

## 7. Restore mechanism

1. **Surgical in-DB restore points (automatic):** immediately before migrating, the apply path copies 13 protected tables to `visa_os._restore_<STAMP>_<table>` (statuses, status_transitions, applications, applicants, agencies, users, currencies, visa_types, document_types, wallet_transactions, document_requests, schema_migrations, site_settings). Existing points from the previous releases are present and were inventoried in this audit: `_restore_202609231044_*` (10 tables) and `_restore_202609231512_*` (12 tables). Restoring = copying rows back from the matching snapshot — a targeted, per-table operation.
2. **All-or-nothing migration transaction:** a failure before commit leaves Production exactly as it was (no partial migration set).
3. **Application rollback:** Vercel keeps immutable deployments — rolling back = redeploy `3a1cdc9` (deployment `6619031743`); no schema change is needed to go back, because 0013–0017 are backward compatible with the old code.
4. **Platform backups / PITR:** Supabase's own backup/PITR configuration is **not verifiable from this sandbox** (no dashboard/API access) — *residual item for the owner to confirm* for the Production project.

## 8. Exact application deployment mechanism (verified, not assumed)

* **Migrations:** GitHub **`Production` environment** + `.github/workflows/prod-release.yml` (id 364587240).
  `audit` job always runs read-only on pushes touching `scripts/prod-release.ts`, `.github/workflows/prod-release.yml` or `release/PROD_GO` · `apply` job runs only when `github.event_name == 'push' && sentinel go == 'true' && audit success`, using `DATABASE_SCHEMA=visa_os` and the first non-empty Production secret of `PRODUCTION_DATABASE_URL / DATABASE_URL / SUPABASE_DATABASE_URL / SUPABASE_DB_URL / POSTGRES_URL_POSTGRES` (masked, never printed). The write path is triggered by the **existence** of `release/PROD_GO` in the pushed tree, not by an add-diff — hence the deliberate disarm in `2f41668`.
* **Application code:** Vercel Git integration deploying **`main`** to Production (latest deployment `6619031743` = `3a1cdc9`, `vercel[bot]`). No `vercel.json` (only `.vercelignore`) — build config lives in the Vercel project.
* **Vercel environment variables:** not readable from this sandbox (no project API token exposed here); identity corroborated indirectly by `/api/health` (`intendedSupabaseProject: true`, `connected: true`, schema `visa_os`). The release adds **no new environment variable** — `git diff 3a1cdc9 5d5418e -- src` contains no new `process.env.*` reference.
* Branch-based deployments seen in the older history (`ref=arena…`, agent bot via Vercel API) were manual and are **not** the configured Production path; Production follows `main`.

## 9. Risks / blockers

| # | Item | Assessment |
|---|---|---|
| 1 | Authorization not yet granted | **Blocker by design** — sentinel absent, apply job SKIPPED on runs 35993822270 and 35994363318 |
| 2 | Production is live data | Any change to ledger/counts/checksums before authorizing **blocks apply fail-closed**; re-audit is triggered automatically by the authorization push and must read READY. `audit_logs` may grow freely |
| 3 | Deploy ordering | New code must not reach `main` before the migrations are applied (42703 otherwise) — the sequence in item 10 enforces this |
| 4 | Document-audience flip (0016/0017) | Decision documents become staff-issued only; verified on Preview (`DOC-AUDIENCE` PASS, 10 agency-provided types still requestable, no checklist depends on a staff-issued type) |
| 5 | Reference counters (0015) | Counter resync proven on Preview (`counter ≥ max reference`); trigger-only assignment verified collision-free and schema-local |
| 6 | Supabase PITR | Not verifiable from the sandbox — owner confirmation recommended (item 7.4) |
| 7 | Restore-point growth | Snapshot tables accumulate (3 date-sets after this release); housekeeping is a deliberate, separate decision — never automatic |
| 8 | Rollback after deploy | Vercel rollback restores the old app instantly, and the old app remains schema-compatible; a *data* rollback is only needed if the release itself is judged wrong (item 7.1/7.2) |

## 10. Exact operations after authorization (nothing runs before it)

1. **Authorization commit:** add `release/PROD_GO` (recording the authorization) to a commit on `arena/01a0ce58-newproject` and push. This fires `prod-release.yml`: read-only audit → *if READY and sentinel present* → **apply**: re-verify the baseline (abort if drifted), create the 13 `_restore_<STAMP>_*` restore points, apply `0013→0017` in one transaction, run the integrity postflight (identical counts, wallet checksum, agency balances, branding; `columnsValid` must end `true`) and publish the **APPLY report** as a commit comment.
2. **Verify the apply report:** ledger must read **0001–0017**, counts/checksums identical to the baseline above, apply job `success`.
3. **Re-disarm immediately:** commit the removal of `release/PROD_GO` (the write path recognizes the file's *existence*), so no later push can re-apply.
4. **Deploy the application:** fast-forward `main` to the release commit (ancestor chain `3a1cdc9 → … → 8f04bb0 → 5d5418e`, so a clean fast-forward). Vercel then builds and promotes the new Production deployment.
5. **Post-deploy verification:** `/api/health` (`columnsValid: true`, ledger 0001–0017, `connected: true`), staff + agency login smoke, dossier/wallet/top-up/document flows, and the hosted E2E suite against Production.
6. **Rollback (only if needed):** Vercel → redeploy `6619031743` (`3a1cdc9`) for the app; row-level restore from the new `_restore_<STAMP>_*` snapshots for data (or the previous `_restore_202609231512_*` set as the pre-release reference).

**Awaiting explicit authorization for step 1. No Production write is pending or scheduled.**
