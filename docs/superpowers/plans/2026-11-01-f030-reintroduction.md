# F-030 Targeted Reintroduction Implementation Plan

> Execution ruling: the later explicit owner decision selects access closure with retained open/financial obligations and confirmed ESSAFARIA responsibility. It supersedes the old zero-balance/no-open-dossier prerequisite in this preparation plan. Implementation and 248 affected regression tests are complete; hosted Preview acceptance and the final owner Production GO remain pending. See docs/operations/f030-execution-ledger-20261101.md.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reuse the V1.1 agency closure on published Staff 5139c8a, preserving archives and finance, with owner-only explicit confirmation and independent future re-registration.

**Architecture:** Retain the existing PostgreSQL identity/agency transaction, current owner/MFA/password checks and audit. Merge closure state checks into the current Staff-aware services rather than replacing their files with old V1.1 versions. No schema migration or Production activation in this preparation.

**Tech Stack:** Next.js 16.4.2, TypeScript, Drizzle, PostgreSQL, existing local synthetic Vitest fixtures.

**Spec:** `docs/operations/f030-reuse-spec-20261101.md`.

## Global Constraints

- Production source is `5139c8a9a1d95df9311fc3453e74a4785d3490da`; preserve every hotfix and Staff permission safeguard.
- Existing source is `226908a2af478808e2a5fc7f2d511d60e243c748`, originating F-030 commit `d76e9434b0e2ebeccb3bbce26b3399ba877c5ea4`.
- Reuse existing code. Do not cherry-pick the full V1.1 or overwrite current account-security/auth/queries files.
- No new Supabase project, service, subscription, real financial test transaction, customer-file copy or destructive operation.
- Preserve MFA, F-030 execution guard until qualification, agency isolation, immutable ledger/audit, current design and permanent Preview alias.
- Existing 2 074 passing Staff tests and historical F-030 receipts remain preserved; rerun only affected tests until a new shared-infrastructure change justifies broader testing.

## Review Focus

- Terminal dossiers with approved/rejected/completed outcomes retain document bytes and Staff access; former agency sessions and direct URLs are denied.
- A concurrent top-up, credit, submission or account activation must not race closure or alter a closed archive.
- Email-only login, one active account per agency, custom Staff profiles and delegated permissions remain intact; delegated Staff never gain closure rights.
- Re-registration uses new UUIDs and Wallet while retaining the old anchor, archived ledger, documents and audit.
- Zero balance must be reconciled; no financial write may be used just to satisfy the closure guard. Retention inputs are owner-supplied.

### Task 1: Recover the existing owner-controlled core

**Files:** Create the four existing core files `src/lib/agency-closure.ts`, `src/app/actions/agency-closure.ts`, `src/components/agency-closure-form.tsx`, `src/lib/agency-closure-copy.ts`; reuse `tests/agency-closure.test.ts` from 226908a2.

**Interfaces:** Existing `ClosureInput`, `ClosurePreview`, `agencyClosurePreview(actor,id)`, `closeAgency(actor,input)`, `requireAgencyClosureTarget(env)` and `AgencyClosureForm` remain the interface. Consume the current `currentOperationActorPg`, current MFA/session schema and strict local fixture helpers.

- [ ] Restore the five new files from the verified Git source, retaining the Production guard. Do not apply the full reference patch.
- [ ] Adapt historical agency authentication assertions to the registered e-mail; preserve the one-account server rule. Keep current owner/MFA fixtures local only.
- [ ] Add failing tests for closure by delegated ADMIN/VISA_AGENT/ACCOUNTING with Staff management enabled, revoked owner credentials/session, and approved/rejected/completed dossier archives.
- [ ] Run the targeted test red phase, then adapt only the mismatched current interfaces. Run it again for green. Historical 11 passing cases are reused as the starting point, not rewritten.
- [ ] Use the existing PasswordField for the confirmation UI without imposing the new-password policy on an already-existing current password. Align confirmation-name length with the actual legal name rather than preserving an arbitrary 160-character UI limit.

### Task 2: Merge lifecycle guards into current services

**Files:** Create `src/lib/agency-identity.ts` from the existing source with current transaction types; merge specific hunks into `src/lib/account-security.ts`, `src/lib/registrations.ts`, `src/lib/applications.ts`, `src/app/actions/applications.ts`, `src/lib/documents.ts`, `src/lib/wallet.ts`, and the existing top-up/decision service only where the new tests demonstrate a missing guard.

**Interfaces:** Reuse `assertAgencyOperational`, `assertAgencyIdentityAvailable`, `assertAgencyIdentityAvailablePg`. Keep all current `staffPermissions`, private profile reading, delegated-role ceilings and credential revocation logic.

- [ ] Add red tests for reactivation of CLOSED agency/accounts, closure versus concurrent credit/top-up and submission, archive note/document/decision mutation, and former-tenant direct document access.
- [ ] Restore only CLOSED-status rejection and the existing agency-identity availability predicates from V1.1/a9ece1c where needed. Current account-security is not replaced.
- [ ] Preserve wallet row locks and reject CLOSED in both credit/debit predicates. Preserve every historical wallet row and balance fingerprint before/after closure.
- [ ] Apply the existing registration exclusion for CLOSED identities under the current identity lock. Keep active user e-mail indexes and new-tenant UUID isolation. Do not create the four proposed agency indexes automatically.
- [ ] Run closure, wallet/top-up, registration, identity-recovery, account-revocation and Staff delegation tests plus teardown. No hosted write is part of these tests.

### Task 3: Restore the existing archive UI without a redesign

**Files:** Merge only closure imports/form and archive-state conditions into `src/app/admin/agencies/page.tsx`, `src/app/admin/agencies/[id]/page.tsx`, and `src/lib/queries.ts`.

**Interfaces:** Extend the current `listAgencies(q?,closed=false)` while retaining current Staff fields/search. Show closure controls only for SUPER_ADMIN and archive view only to authorized Staff.

- [ ] Add failing UI/service checks for normal list excluding CLOSED, archive list including it, retained terminal dossier links, and absence of closure controls for delegated Staff.
- [ ] Reuse the existing trilingual closure copy and confirmation form. Keep operational controls disabled for CLOSED agencies; retain existing styles.
- [ ] Verify synthetic UI with FR/EN/AR and normal permission/session flow. Do not operate the permanent Preview owner account, its MFA, or actual client data.

### Task 4: Qualify the future release and Production activation separately

**Files:** Update the new F-030 evidence packet, exact SHA/change list, future release procedure and rollback rules.

- [ ] Run necessary regression tests, typecheck/lint/build on the assembled F-030 code. Compare scoped financial/document fingerprints on synthetic closure and re-registration. Preserve the 5139c8a publication proofs.
- [ ] Qualify a protected existing-resource test environment with fictitious data. The old target guard does not authorize either the current Production or the permanent Preview: do not remove it simply to make a button work.
- [ ] Define the bounded server-side release target policy only after qualification and explicit GO F-030; client fields/cookies cannot authorize a closure. Normal SUPER_ADMIN MFA, current-password verification and typed confirmation remain mandatory.
- [ ] Before future Production activation, confirm ledger compatibility, existing backup evidence and rollback compatibility. A code rollback that ignores CLOSED states must be blocked after any real closure; use a compatibility-preserving forward fix or separately approved recovery, not automatic tenant reactivation.
- [ ] Obtain separate qualification/publication authorization and real-operation retention/financial decisions as applicable. No new project, paid restoration, automatic purge or real agency closure is authorized by this preparation.

## Preparation state

Source extraction and patch compatibility checks are complete. Eight files have verified Git blob hashes; the additive core patch applies structurally, the full F-030 commit does not. Application code, schemas and hosted F-030 behavior remain unchanged. Implementation and qualification boxes above are intentionally unchecked.
