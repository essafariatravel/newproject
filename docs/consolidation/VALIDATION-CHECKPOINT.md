# Consolidation validation checkpoint — 2026-10-08

Candidate branch: `codex/world-class-final-consolidation-2026-10-07`.
Release base: `905ed99a7c898a4dd2a10837763ae604ec1771de`.
Arena reviewed: `a6eed3d04f83324da8e8496e130ed7f96327550a`.
Fresh fetch on 2026-10-08 confirmed both source refs unchanged. All valid candidate work was preserved; Arena reports were not adopted as release proof.

## Current local qualification

- Locked dependency installation passed.
- Complete deterministic suite passed in normal and reverse order: **176 files, 1,334 tests passed, one existing Windows-only test skipped, 1,335 collected** in each order. No coverage was removed. Normal duration: 526.68 seconds; reverse: 535.25 seconds.
- Affected date-navigation and performance-evidence regression checks passed. The broader focused DR/configuration/observability/performance run passed eight files and 60 tests.
- Typecheck, lint and optimized application build passed.
- All four security gates passed: 631 previously tracked files, 1,218 historical revisions, 13 pinned workflows and 241 application source files. The newly added regression files must also pass the tracked-file gate after staging.
- Production dependency audit returned **zero vulnerabilities** after retrying a transient npm registry error; the lockfile and thresholds were unchanged.
- A separate real disposable PostgreSQL monitor check passed: the first sample preceded the simulated workload, the stop marker flushed evidence successfully, and nine samples covered the workload.

Logs and private evidence remain ignored under `tmp-final-verify/`. Exact remote SHA and final-SHA GitHub CI must be recorded after pushing; no previous SHA's CI substitutes for them.

## Corrections and suite isolation

The observability suite owns a separate disposable PostgreSQL **cluster**, applies the complete migration ledger and uses a real pool. This avoids the shared-cluster checkpoint pressure reproduced on Windows. Mock cleanup remains explicit, and final teardown stays last in both deterministic orders. Both complete current runs passed.

Real Preview browser testing found that the date header announced a return to days while remaining on the year pane, and that its pane names remained English in French and Arabic. The corrected callback cycles days → months → years → days. All pane names are localized. Regression tests exercised the failing callback and rendered locale names before and after correction. The updated component still requires exact-final-SHA browser verification after deployment.

The old performance monitor stopped after hold + two minutes, omitting part of longer ramp/hold/down profiles. The corrected runner waits for a first real sample before traffic, owns the monitor child directly, signals completion after k6, and rejects missing, failed or prematurely ending monitoring. Previous-tier gates require complete same-SHA, same-Preview evidence. Existing budgets and workload were preserved. Explicit spike and two-hour soak modes require a previously proven stable tier.

## Hosted and recovery evidence already obtained

Previous candidate SHA `475ceaa3fdfb253f4716d22fe0dce44cd0c5fadb` passed exact-SHA CI run `37657509939`, including all 1,319 tests on Linux and both suite orders. Its isolated Preview passed public/protected health and native adversarial checks. It recorded passing 10- and 50-VU workloads, but the older 50-VU monitor did not cover the complete run. These are historical measurements; the updated candidate must restart ordered final capacity qualification at 10 VUs.

Real Production **read-only** backup run `37650796497` restored into existing recovery project `vwixmkzgpmzgwbshzxji`. The 19-entry ledger, wallet invariants and all 13 blob hashes matched. The actual Production revision started against recovery and passed seven runtime and six tenant-isolation checks. Finalization was VERIFIED at 2026-10-07T17:00:58.825Z. The offsite GitHub artifact expires on October 10; durable retention and independently recoverable key escrow remain owner decisions. See `OPERATIONS-REVIEW.md` for precise limits. This is separate from the passing synthetic local DR drill.

Fresh read-only Production aggregates captured at 2026-10-07T20:35:30Z matched protected counts, ledger and wallet/balance checksums. Production deployment identity remained unchanged. Revalidate before the final handoff; do not repair any new drift automatically.

## Scope and outstanding release gates

Candidate migrations 0032 and 0033 remain outside the authorized Production 0020–0031 scope. Production preflight must reject them until separately approved. The final-SHA CI, Preview runtime/browser checks and measured capacity evidence remain separate gates after these commits. Independent pentest, approved legal publication, Brevo account/sender/DNS readiness, malware scanning policy, database credential rotation and durable recovery-key custody require external decisions or explicitly authorized owner action.

Production database, deployment, DNS and credentials were not modified. This checkpoint is evidence of completed local engineering qualification, not go-live approval.
