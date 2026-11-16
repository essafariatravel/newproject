# ESSAFARIA autonomous completion implementation plan

> For agentic workers: use superpowers:executing-plans for root tasks and focused parallel agents for independent confirmed defects. Check each task against its observable acceptance criterion.

**Goal:** complete safe engineering work toward controlled B2B launch, while keeping Production unchanged and active Preview cleanup behind exact owner approval.

**Architecture:** reuse candidate cff15877e0edf200f91aaefc4ca81e5d8ebe684e and existing tests; isolate new changes on codex/essafaria-autonomous-completion-2026-10-13. Source database inspection is read-only. Recovery materials remain private on G/D. Validate mutations only against disposable loopback fixtures unless separately approved.

**Tech stack:** locked Next.js 16.3.8, React, TypeScript, PostgreSQL 17, Drizzle, Vitest and existing browser tooling.

**Spec:** owner-provided `ESSAFARIA VISA OS — ULTIMATE AUTONOMOUS COMPLETION MISSION`, received 2026-10-13 in the current task. The complete original is in the private task attachment; it is not a public-repository deliverable.

## Global constraints

- Production visa_os, main, DNS, credentials and hosting spend stay unchanged.
- No PROD_GO sentinel; no release-scope expansion or guard bypass.
- No hosted load tests; local fixtures are loopback-only.
- No secrets, recovery archives, private identities or source records in Git or reports.
- Active Preview deletion/renaming/anonymization requires exact STOP GATE A approval after refreshed inventory and rehearsal.
- Preserve the approved ESSAFARIA design; no Arena redesign or speculative features.

## Review focus

- Automatic Preview builds must not reintroduce demo data or run migration/bootstrap mutations on this engineering branch.
- Explicit demo flags must never permit seeding Production or recreating fictitious SUPER_ADMIN accounts in the controlled acceptance Preview.
- Effective ACL defaults must be compared semantically; immutable audit and financial history must be retained.
- MFA enrollment must use genuine authorization and owner-controlled TOTP/recovery custody.
- Local/CI success must remain separate from exact-SHA hosted acceptance and Production recovery.

## Execution tasks

- [x] Verify current local candidate and remote release HEAD; reuse the clean linked worktree and create the isolated working branch.
- [x] Reuse current Preview recovery proof; inspect existing cleanup plan and real migration/admin/configuration state read-only.
- [x] Finish requested Matt Pocock setup using GitHub/default labels/single-context layout inferred from the repo and autonomous owner instruction. No issue/comment publication.
- [x] Reproduce and fix engineering-branch automatic build mutations. Seam: existing public build-policy function plus build guard tests; touch scripts/lib/build-policy.ts, tests/build-preview-guard.test.ts and relevant deployment suppression only.
- [x] Reproduce and fix demo-seed safety. Seam: seed CLI/policy before first database write; touch scripts/seed.ts, a focused seed-policy helper and regression tests. Keep disposable local development usable.
- [x] Capture current per-table cleanup counts and content fingerprints, compare verified backup coverage and owner-declared fixture scope; produce exact preservation/cascade/rollback inventory.
- [x] Rehearse cleanup invariants/rollback locally using existing reset tests and safe new tests where a confirmed gap exists. No cleanup source mutation. DRAFT-only reactivation and one audit append were separately authorized and verified with a fresh encrypted backup and real isolated restore.
- [x] Verify admin MFA/bootstrap/first-password-change behavior with current tests; identify genuine owner enrollment steps without issuing a fake authorization.
- [x] Run deterministic local business, tenant, document, financial, legal and localization tests against disposable fixtures. Repair confirmed failures without broad refactors.
- [x] Verify current Preview deployment identity and legitimate protected access; run bounded exact-target smoke only when authorized access is available.
- [x] Inspect approved UI in local FR/EN/AR and responsive states; fix only observable defects. Use repository design/screenshot skill instructions.
- [x] Review observability/privacy integration contracts and measured performance; keep unavailable external service checks explicitly blocked.
- [x] Verify actual Production migration ledger read-only; locally rehearse 0020–0033 against a disposable 0019 baseline using existing migration tooling. Do not equate that with independently restored Production recovery.
- [x] Run final typecheck, lint, applicable full suite, build, dependency/secret/security checks after changes; review standards/spec independently.
- [ ] Commit coherent changes, audit publication triggers, prepare a draft PR if publication can remain non-deploying, and qualify exact SHA/CI evidence.
- [ ] Produce ESSAFARIA_VISA_OS_FINAL_COMPLETION_REPORT.md with requested A–T sections and exact verdict fields. Keep GO_LIVE_READINESS=NO_GO while mandatory external gates remain.

Owner decisions remain only where indispensable: exact active Preview cleanup approval, real MFA enrollment/custody, legal wording/retention/vendor approval, commercial hosting, independent Production recovery and reviewed Production migration authority.

## Verified outcomes and remaining gates

- Typecheck, lint and offline build PASS; 184 test files, 1457 passed, 1 skipped. Standards/spec reviews have zero remaining findings.
- Real Preview restoration after the authorized DRAFT fix: 42 tables, 33740 rows, 33 migrations, all data/catalog fingerprints match, physical checksum errors zero.
- Cleanup reconstruction and seven forced transaction rollbacks passed locally. Active Preview cleanup remains unauthorized; maintenance/drained pools and archive function/sequence isolation still need qualification.
- Source admin MFA is not enrolled; approved legal versions and operational telemetry are not verified.
- Hosted acceptance remains BLOCKED by legitimate Vercel access. Local EN login and FR landing responsive DOM checks passed; Arabic/rendered accessibility/performance checks remain BLOCKED by browser approval policy.
- Production remains unchanged and NO_GO; migration rehearsal was synthetic local data, not an independently restored Production backup.
