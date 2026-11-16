# Consolidation validation checkpoint — 2026-10-08

Candidate branch: `codex/world-class-final-consolidation-2026-10-07`.
Release base: `905ed99a7c898a4dd2a10837763ae604ec1771de`.
Arena reviewed: `a6eed3d04f83324da8e8496e130ed7f96327550a`.
Fresh fetch on 2026-10-08 confirmed both source refs unchanged. All valid candidate work was preserved; Arena reports were not adopted as release proof.

## Completed local qualification before the dependency patch

- Locked dependency installation passed.
- Complete deterministic suite passed in normal and reverse order: **176 files, 1,334 tests passed, one existing Windows-only test skipped, 1,335 collected** in each order. No coverage was removed. Normal duration: 526.68 seconds; reverse: 535.25 seconds.
- Affected date-navigation and performance-evidence regression checks passed. The broader focused DR/configuration/observability/performance run passed eight files and 60 tests.
- Typecheck, lint and optimized application build passed.
- All four security gates passed: 631 previously tracked files, 1,218 historical revisions, 13 pinned workflows and 241 application source files. The newly added regression files must also pass the tracked-file gate after staging.
- Production dependency audit returned **zero vulnerabilities** after retrying a transient npm registry error; the lockfile and thresholds were unchanged.
- A separate real disposable PostgreSQL monitor check passed: the first sample preceded the simulated workload, the stop marker flushed evidence successfully, and nine samples covered the workload.

Logs and private evidence remain ignored under `tmp-final-verify/`. Exact remote SHA and final-SHA GitHub CI must be recorded after pushing; no previous SHA's CI substitutes for them.

## Current patched keyboard qualification

Next.js 16.3.8 is committed as `0c7f61c`. Its complete pre-keyboard qualification passed both orders (176 files, 1,334 passing tests and one existing Windows-only skip), all security gates and build. The subsequent calendar correction adds 15 behavioral regression tests. Those tests reproduced the defects before the fix; the complete affected four-file run now passes 33 tests in both orders.

The fresh consolidated normal-order suite passed **177 files, 1,347 tests and one existing Windows-only skip** (1,348 collected), duration **647.54 seconds**. Clean install, typecheck, lint, all four security gates and production audit passed; a separate all-dependency audit also found zero vulnerabilities. Current gate coverage: 634 tracked files, 1,222 historical revisions, 13 pinned workflows and 241 application source files. That revision also passed reverse order (735.32 seconds) and build. Subsequent review reproduced two year-pane return defects: leap day carried into a non-leap year and returning to an out-of-range day grid. Both are corrected with existing month/day clamping, and a new complete qualification is running. The 1,347-test results precede these final two regressions and must not be represented as final.

After those final corrections, clean install, focused checks, typecheck, lint, all four security gates and production dependency audit passed again. The corrected complete suite passed **177 files, 1,349 tests and one existing Windows-only skip** (1,350 collected) in **both orders**: normal **607.15 seconds**, reverse **583.52 seconds**. The optimized build also passed. These are the final corrected local source results; final-SHA GitHub CI and hosted qualification remain required.

## Dependency advisory caught by final-SHA CI

The push of `4d97bf5199376710f7f84ef6a65d3eee01edac71` triggered run `37744627988`. Its security audit rejected the locked Next.js 16.3.6 dependency after newly available advisory metadata reported a HIGH vulnerability, including image-optimization SSRF. The earlier zero-vulnerability audit is historical and does not override this failure. No load escalation or manually qualified deployment was authorized by the failed CI.

The candidate pins Next.js **16.3.8**, the [vendor security patch release](https://github.com/vercel/next.js/releases/tag/v16.3.8), and updates only the Next.js family lock entries. Existing unrelated versions and Linux libc metadata are preserved. A fresh production audit returned zero vulnerabilities. Complete clean qualification is being repeated against this patched lockfile; record its actual results and obtain CI on its final commit before treating it as release evidence.

## Corrections and suite isolation

The observability suite owns a separate disposable PostgreSQL **cluster**, applies the complete migration ledger and uses a real pool. This avoids the shared-cluster checkpoint pressure reproduced on Windows. Mock cleanup remains explicit, and final teardown stays last in both deterministic orders. Both complete current runs passed.

Real Preview browser testing found that the date header announced a return to days while remaining on the year pane, and that its pane names remained English in French and Arabic. The corrected callback cycles days → months → years → days. All pane names are localized. Regression tests exercised the failing callback and rendered locale names before and after correction. The updated component still requires exact-final-SHA browser verification after deployment.

Further keyboard regressions reproduced and corrected: PageUp/PageDown now clamp the day to shorter months and date bounds; arrow keys request actual browser focus; Home/End follow Monday-based week edges; selection and Escape return focus to the calendar trigger. Calendar weeks contain seven grid cells and full accessible weekday names. Month/year panes are named groups of native buttons rather than falsely declaring incomplete composite grids. French/Arabic names and existing hidden ISO submission semantics are preserved.

The old performance monitor stopped after hold + two minutes, omitting part of longer ramp/hold/down profiles. The corrected runner waits for a first real sample before traffic, owns the monitor child directly, signals completion after k6, and rejects missing, failed or prematurely ending monitoring. Previous-tier gates require complete same-SHA, same-Preview evidence. Existing budgets and workload were preserved. Explicit spike and two-hour soak modes require a previously proven stable tier.

## Hosted and recovery evidence already obtained

Previous candidate SHA `475ceaa3fdfb253f4716d22fe0dce44cd0c5fadb` passed exact-SHA CI run `37657509939`, including all 1,319 tests on Linux and both suite orders. Its isolated Preview passed public/protected health and native adversarial checks. It recorded passing 10- and 50-VU workloads, but the older 50-VU monitor did not cover the complete run. These are historical measurements; the updated candidate must restart ordered final capacity qualification at 10 VUs.

Real Production **read-only** backup run `37650796497` restored into existing recovery project `vwixmkzgpmzgwbshzxji`. The 19-entry ledger, wallet invariants and all 13 blob hashes matched. The actual Production revision started against recovery and passed seven runtime and six tenant-isolation checks. Finalization was VERIFIED at 2026-10-07T17:00:58.825Z. The offsite GitHub artifact expires on October 10; durable retention and independently recoverable key escrow remain owner decisions. See `OPERATIONS-REVIEW.md` for precise limits. This is separate from the passing synthetic local DR drill.

Fresh read-only Production aggregates captured at 2026-10-07T20:35:30Z matched protected counts, ledger and wallet/balance checksums. Production deployment identity remained unchanged. Revalidate before the final handoff; do not repair any new drift automatically.

Refreshed on **2026-10-08T08:30:32.799224Z**, the read-only Production transaction again matched every protected count, the exact 0001–0019 ledger and both accounting checksums. Read-only Vercel metadata at **08:46:44 UTC** confirmed the same Production deployment `dpl_57Zqe1SS6ArbAy6tH1LGCdKabom4`, READY at SHA `831607a2ed0423d575d693b8f8f3a9dfc1e5d9d1`. No Production writes or deployment changes were performed.

## Scope and outstanding release gates

Candidate migrations 0032 and 0033 remain outside the authorized Production 0020–0031 scope. Production preflight must reject them until separately approved. The final-SHA CI, Preview runtime/browser checks and measured capacity evidence remain separate gates after these commits. Independent pentest, approved legal publication, Brevo account/sender/DNS readiness, malware scanning policy, database credential rotation and durable recovery-key custody require external decisions or explicitly authorized owner action.

Production database, deployment, DNS and credentials were not modified. This checkpoint is evidence of completed local engineering qualification, not go-live approval.
