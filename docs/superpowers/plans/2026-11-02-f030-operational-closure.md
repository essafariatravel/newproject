# F-030 operational closure correction

> **For agentic workers:** Use superpowers:executing-plans inline. One targeted final review, no broad audit.

**Goal:** Let SUPER_ADMIN revoke an agency's operational access without inventing a retention policy or an archive erasure date.

**Architecture:** Keep the existing atomic closure, financial checks, owner MFA/session/password/name confirmation and explicit outstanding-obligations handover. Remove the two retention inputs from this non-erasing action; record operational scope and absence of erasure authorization in its immutable audit. Physical retention execution remains separate and unchanged.

**Tech Stack:** Existing Next.js server actions, Zod, PostgreSQL transaction, Vitest; locked dependencies.

**Spec:** Owner's 2026-11-02 targeted F-030 correction request. Base: published a86ddef31dde84f1781010977a3e3de7d4ca8e08, including Staff 5139c8a and hotfix 412a5db.

## Constraints and evidence

- Preview only; no Production release without new GO. No real agency closure, new owner/MFA, migration, paid service or permanent Preview alias change.
- `retentionReference` / `retainUntil` have no reader outside this action and its audit/tests. They do not configure document retention or authorize erasure.
- `document-retention-policy.ts` still rejects hosted execution. Its independent holds, review, coverage and recovery gates are unchanged.
- `docs/privacy/retention-decision-register.md` distinguishes deactivation, retained immutable financial/audit history, and separately approved deletion; TBD retention durations must not be invented.
- Legal context checked narrowly against [law 18-07, article 9 and article 14](https://www.joradp.dz/FTP/JO-FRANCAIS/2018/F2018034.pdf) and [law 25-11, article 41 bis 2/3](https://www.joradp.dz/FTP/JO-FRANCAIS/2025/F2025048.pdf): purpose-limited retention and documented processing remain necessary. Engineering inference: closing portal access does not itself require the operator to choose an erasure date. This change sets no statutory duration, does not approve indefinite retention and does not certify legal compliance.
- Historical closure audits remain immutable; obsolete retention fields from an old form are ignored rather than interpreted as a new retention/deletion instruction.

## Targeted implementation and qualification

- [x] Reproduce with a failing real PostgreSQL test: missing retention inputs reject with TypeError before the confirmation flow (12 passed, 1 failed).
- [x] Remove retention inputs/validation from `agency-closure.ts`, its server action and form; retain every revocation/financial guard. Audit `closureScope=OPERATIONAL_ACCESS`, `retentionPolicyChanged=false`, `archiveErasureAuthorized=false`.
- [x] Clarify FR/EN/AR copy and field-specific validation errors; test native action without retention fields, wrong name, malformed input, legacy form data and archive/finance preservation.
- [x] Run affected closure/security/retention/financial regressions: 84 passed, 0 failed, 0 skipped; affected lint and optimized readonly build passed. Targeted final static review: no blocker.
- [ ] Commit on `codex/f030-operational-closure-2026-11-02`; stage one isolated protected Preview with exact committed source. Keep Production and permanent Preview aliases unchanged.
- [ ] Qualify one synthetic agency through native Preview action with owner password entered only in browser; compare archive/finance snapshots, revocation, idempotency and tenant isolation. Request only necessary owner login/firewall/password assistance.

## Review focus

Missing or stale hidden retention fields must not become deletion authority. Completed dossiers and private bytes must survive. Current owner MFA/session/password and typed name must remain mandatory. Outstanding obligations require explicit handover. Repeated closure must not duplicate audit or finance effects.

## Execution ruling

The affected financial regression exposed an existing READ COMMITTED snapshot race: a concurrent credit could commit while the combined snapshot SELECT waited for the agency row, producing a new balance with stale ledger subqueries and a false reconciliation refusal. Reproduced deterministically by holding a synthetic credit transaction, observing the closure's row-lock wait, committing the credit, then observing CLOSURE_BLOCKED. Acquire the agency row lock in a separate statement before reading the complete snapshot. Keep all reconciliation predicates unchanged. This narrow fix is necessary to preserve the existing tested closure/finance behavior; no wallet mutation or new financial workflow is added.
