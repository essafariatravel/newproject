# Consolidation validation checkpoint — 2026-10-07

Candidate branch: `codex/world-class-final-consolidation-2026-10-07`.
Release base: `905ed99a7c898a4dd2a10837763ae604ec1771de`.
Arena reviewed: `a6eed3d04f83324da8e8496e130ed7f96327550a`.
Both source refs were fetched again and remain unchanged.

## Local evidence

- Locked dependency installation passed.
- Complete deterministic suite: 173 files passed, 1,311 tests passed, one skipped (1,312 collected). The existing skip is retained; test coverage was not reduced.
- Focused wizard/date-input suite: two files, 15 tests passed.
- Typecheck, lint and optimized application build passed.
- Static credential-artifact gate, historical secret gate (1,206 revisions), immutable Actions gate (11 workflows) and dangerous-source AST gate (228 source files) passed.
- Production dependency audit: zero vulnerabilities.
- Synthetic local DR drill passed with PostgreSQL 17 dump/restore, encrypted archive, migration ledger, wallet and blob integrity, runtime and tenant isolation. This is not real offsite/recovery evidence.
- Local authenticated Arabic/RTL browser checks: Arrow keys expose the active destination, Escape closes suggestions, Enter after Escape leaves the destination unselected, and keyboard activation of an option focuses the Change button. Screenshots remain ignored under `.screenshots/qa/`.

Detailed local logs are retained outside Git in `tmp-final-verify/`. The release workflow also runs the complete suite in reverse order and verifies the exact checkout SHA. The authoritative remote candidate SHA and its Actions run must be obtained after pushing; this document does not substitute an earlier CI result for final-SHA verification.

## Observability isolation correction

An additional Windows reverse-order run reproduced a 60-second timeout in the real storage-size aggregate after heavy shared-database fixtures. Read-only activity inspection identified the executing storage-size query; focused fresh-database checks and Linux CI did not reproduce the timeout. The real observability suite now creates its own disposable localhost database, applies the complete migration ledger, routes the snapshot through a real PostgreSQL pool and removes the database after the suite. This preserves real runtime queries, all assertions and the existing timeout while eliminating dependence on earlier fixture relation files. The corrected focused observability/namespace/teardown run passed three files and eight tests. The complete corrected local reverse-order suite then passed 173 files and 1,311 tests, with the existing Windows-only shell check skipped. The previously timed-out aggregate completed in 470 ms. Typecheck, lint, all four security gates, the zero-vulnerability dependency audit and the build passed again. The final correction requires its own exact-SHA CI after pushing.

## Scope and safety

All valid consolidation work was preserved. Arena's engineering was selectively integrated; its stale final reports were not adopted. Candidate migrations 0032 and 0033 remain outside the authorized Production 0020–0031 scope. Production preparation must reject them until separately approved.

Production database, deployment, DNS and credentials were not modified. Passing this checkpoint does not prove Preview runtime, performance capacity, independent pentest, complete hosted browser coverage, real disaster recovery, Brevo account/DNS readiness or approved legal publication. Those remain separate evidence gates in the original mission.
