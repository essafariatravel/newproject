# Isolated Hosted Capacity Qualification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Obtain a defensible, monitored statement of the number of simultaneously active ESSAFARIA VISA OS users supported by Production-comparable Vercel/Supabase infrastructure, without accessing Production.

**Architecture:** A test-only branch of the verified Production tree is deployed to a new Vercel project linked exclusively to a new Supabase project. Separately guarded, explicitly allowlisted k6 tooling generates authentic synthetic-user workloads and records application, function and database metrics. The existing local-only performance harness remains unchanged.

**Tech Stack:** Next.js/Node 24, PostgreSQL/Supabase, Vercel, TypeScript/Vitest and k6.

**Spec:** `docs/superpowers/specs/2026-11-09-isolated-capacity-test-design.md`

## Global Constraints

- **No cloud resource creation, live traffic generation, paid action or deployment before the owner approves the aggregate budget and TEST project details.** This document itself can be written and reviewed without cost.
- Use the exact Production Git tree; do not deploy or modify the current Production project, database, storage or domains.
- No secret values in source, logs, test fixtures, commits or exported reports.
- Preserve local-only harness and tests; no broad `ALLOW_HOSTED_PERF` bypass.
- No automatic migrations/seeds on build. No real records or external side effects.
- Retain MFA, RBAC, financial invariants, tenant authorization and migration semantics.

## Review Focus

1. A redirect or alternate numeric/IP URL must not get a test cookie or traffic → test runner must reject noncanonical origins and redirects.
2. Deployment pointed at Production Supabase or wrong Vercel project must fail before a connection → test deployment-boundary unit tests.
3. Staff session missing completed MFA must fail, not become a synthetic PASS → test real authentication preflight.
4. Two concurrent wallet actions must not silently create or lose money → test ledger integrity with synthetic concurrent changes.
5. A missing monitoring interval, interrupted test or unexpected cost threshold must produce INCONCLUSIVE/STOP, never PASS → evaluator tests.

---

### Task 1: Confirm the charge and deployment gate (**before cloud mutation**)

**Files:**
- Create: `docs/performance/hosted-test-approval.md`

**Interfaces:**
- Consumes: Live inventory, official Supabase quote and Vercel billing information.
- Produces: Dated, owner-approved spending ceiling, test project names, compute tier, test window and cleanup authority.

- [ ] **Step 1:** Obtain via read-only dashboard/API the current Production compute size, Supabase project region, Vercel team plan and applicable variable charges; do not inspect secret values.
- [ ] **Step 2:** Quote a bounded maximum duration and Vercel/Supabase/generator estimate, with explicit cleanup instructions and caveat that alerts do not enforce a hard spend cap.
- [ ] **Step 3:** Present the full amount to the owner and **wait for explicit approval**; do not infer it from approval of this design.
- [ ] **Step 4:** Record the approved resource names/IDs and maximum permitted scope before any change.

### Task 2: Prepare fail-closed hosted TEST application boundaries

**Files:**
- Create: `src/lib/isolated-performance.ts` (test branch only)
- Modify: `src/lib/database-config.ts` (test branch only)
- Modify: `scripts/lib/build-policy.ts` (test branch only)
- Modify: `vercel.json` (test branch only, disable automatic Git deployment for this branch)
- Test: `tests/isolated-performance-boundary.test.ts`

**Interfaces:**
- Consumes: Exact TEST branch, Vercel project ID, Supabase project ref, existing `visa_os_preview` schema in the separate test database and expected `VERCEL_ENV=preview`.
- Produces: `isolatedPerformanceContext(env): boolean` and `isolatedPerformanceConnection(url): boolean` validated before connection or migration.

- [ ] **Step 1:** Write failing tests rejecting Production, recovery refs, wrong branch/project, missing env, URL host/user overrides, disabled TLS, prod schema and Production deployment environment; include one valid test-only case. Verify this exact branch always forbids build-time migrations and demo seed, regardless of credentials.
- [ ] **Step 2:** Run `npx vitest run tests/isolated-performance-boundary.test.ts` → expected FAIL.
- [ ] **Step 3:** Add narrowly scoped TEST-only checks using **literal** newly approved project identifiers; explicitly protect this branch in `automaticDatabaseChangesForbidden` and disable Git auto-deployment; preserve the current Production and historical-preview guards for all other cases.
- [ ] **Step 4:** Run boundary tests, `tests/isolated-preview-boundary.test.ts`, `tests/database-schema.test.ts` → PASS without modifying the existing schema policy.
- [ ] **Step 5:** Inspect diff; no change to main or Production deployment; commit to the dedicated TEST branch only.

### Task 3: Prepare synthetic fixtures and genuine sessions

**Files:**
- Create: `scripts/hosted-perf/seed-test-only.ts`
- Create: `scripts/hosted-perf/auth-test-only.ts`
- Test: `tests/hosted-perf-dataset-safety.test.ts`

**Interfaces:**
- Consumes: Verified TEST project ref, test branch manifest, reviewed migrations, a synthetic application schema and synthetic test-only secrets.
- Produces: Versioned synthetic data manifest and per-role authentic sessions (never forged MFA markers).

- [ ] **Step 1:** Write failing tests that reject every Production/recovery project and every attempt to load existing local-only seed scripts with remote credentials.
- [ ] **Step 2:** Run `npx vitest run tests/hosted-perf-dataset-safety.test.ts` → expected FAIL.
- [ ] **Step 3:** Implement a separate TEST-only provisioning path, gated by the exact project IDs and test schema, for reviewed migrations and bounded synthetic seed data. Reuse pure data logic, not current local-only script entry points.
- [ ] **Step 4:** Implement true role-specific app sign-ins; authenticate Staff/Super Admin via real TEST MFA challenge or declare that role unqualified.
- [ ] **Step 5:** Verify synthetic fixture counts, tenant FK integrity, wallet sums and no real e-mail/storage integration before a campaign; run tests → PASS.

### Task 4: Prepare a separate hosted k6 runner

**Files:**
- Create: `perf/hosted/target-safety.js`
- Create: `perf/hosted/essafaria-capacity.js`
- Create: `scripts/hosted-perf/preflight.ts`
- Test: `tests/hosted-perf-target-safety.test.ts`

**Interfaces:**
- Consumes: Manually approved TEST origin/ref/branch manifest and genuinely authenticated synthetic session files.
- Produces: Guarded per-tier k6 requests and standardized output; does not import/bypass `perf/local-safety.js`.

- [ ] **Step 1:** Write failing tests for Production/wrong-origin targets, altered URL spelling, redirects, unapproved VUs, absent session manifests and mismatch between TEST Vercel deployment metadata and approved scope.
- [ ] **Step 2:** Run `npx vitest run tests/hosted-perf-target-safety.test.ts` → expected FAIL.
- [ ] **Step 3:** Implement exact HTTPS origin allowlisting, `redirects: 0`, safe session mapping, a single approved fixed VU tier and bounded think time. Never permit `k6 cloud` or exporter credentials.
- [ ] **Step 4:** Cover reads and representative bounded writes, plus normal polling and the exact operation budgets. Run target-safety tests and the existing `tests/hosted-k6-policy.test.ts` → PASS.
- [ ] **Step 5:** Commit test-only harness; never publish it into the customer-facing app.

### Task 5: Monitoring, integrity and report evaluator

**Files:**
- Create: `scripts/hosted-perf/evaluate.ts`
- Create: `docs/performance/hosted-evidence-format.md`
- Test: `tests/hosted-perf-evaluation.test.ts`

**Interfaces:**
- Consumes: k6 metric export, TEST-only DB metrics, function metrics, before/after tenant and ledger snapshots, budget version, infrastructure metadata.
- Produces: `PASS`, `STOP` or `INCONCLUSIVE` with a maximum proven VU tier.

- [ ] **Step 1:** Write failing tests requiring p95 < 2000 ms, error < 1%, no integrity issues, full monitoring coverage and cooldown recovery.
- [ ] **Step 2:** Run `npx vitest run tests/hosted-perf-evaluation.test.ts` → expected FAIL.
- [ ] **Step 3:** Implement evaluator with strict stop conditions and explicit missing-evidence behavior; retain operation-specific budgets from `perf/budgets.json`.
- [ ] **Step 4:** Run evaluator tests, lint, typecheck and existing safety tests → PASS.

### Task 6: Provision **only after Task 1 budget approval**

**Files:**
- No Production files modified. Record the TEST project IDs only in protected TEST configuration and `docs/performance/hosted-test-approval.md`.

**Interfaces:**
- Consumes: Owner's approved maximum budget and exact TEST environment mapping.
- Produces: Dedicated Vercel TEST project, dedicated Supabase TEST project, validated TEST schema, and zero links to Production.

- [ ] **Step 1:** Reconfirm current Production SHA and expected infrastructure sizing; stop on mismatch.
- [ ] **Step 2:** Create the uniquely named Supabase TEST project in the confirmed organization, within the approved compute size; never reuse recovery projects.
- [ ] **Step 3:** Create a distinct Vercel TEST project; deploy only the dedicated branch to Preview, with TEST-only credentials and no automatic DB writes.
- [ ] **Step 4:** Verify project ID, TEST DB ref, schema, TLS, MFA, disabled e-mail/webhooks/cron and blocked Production destinations before creating fixtures or sending load.

### Task 7: Run campaigns sequentially with manual gates

**Files:**
- Create: `docs/performance/results/2026-11-isolated-capacity.md` (sanitized metrics only)

**Interfaces:**
- Consumes: Completed TEST-only preflight, synthetic sessions and monitored resources.
- Produces: Proven maximum simultaneous active users, bottleneck analysis and cleanup record.

- [ ] **Step 1:** Execute 10 VUs, then only if PASS 25, 50, 75, 100; never auto-escalate. Run optional larger tiers only after reviewing costs and 100-VU evidence.
- [ ] **Step 2:** For each tier, record p50/p95/p99, error %, request rate, app and DB saturation, integrity and cooldown. Stop on any critical failure, production boundary uncertainty, financial issue or missing monitor sample.
- [ ] **Step 3:** Hold the highest passing tier for 30 minutes, then verify baseline recovery. If interrupted, label INCONCLUSIVE.
- [ ] **Step 4:** Generate a user-readable verdict with truthful highest qualified tier and safe scaling recommendations.
- [ ] **Step 5:** Teardown **only** the exact TEST resources if specifically authorized; verify all charge-bearing TEST resources stopped/removed and confirm that Production is unchanged.

## Initial local baseline evidence

- `2026-11-09`: `npx vitest run tests/isolated-preview-boundary.test.ts tests/performance-safety.test.ts tests/hosted-k6-policy.test.ts tests/performance-preflight.test.ts` → **144 tests PASS, 4 files PASS**.
- No hosted resource created, no Production traffic generated, no paid action taken during preparation.

