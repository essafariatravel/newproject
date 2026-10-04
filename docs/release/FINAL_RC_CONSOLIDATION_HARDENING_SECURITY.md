# ESSAFARIA VISA OS — FINAL RC CONSOLIDATION

## Hardening + Security

Date: 2026-10-04

Repository: `essafariatravel/newproject`

Consolidation branch: `rc/final-hardening-security-consolidation`

Production deployment: FORBIDDEN during this consolidation.

Production migrations: FORBIDDEN during this consolidation.

## 1. Source-of-truth heads

Final Hardening:
- branch: `preprod/essafaria-final-hardening`
- head: `31b3397cedbeead0c1cf556297f8534a142e216e`
- deterministic CI: SUCCESS
- suite: 92 test files / 652 tests
- legal/privacy runtime smoke: PASS

Security:
- branch: `security/pre-codex-gate-2026-10-03`
- head: `5d8aebe9648fe2c121df0693f033e84c7ac6611e`
- deterministic CI: SUCCESS
- suite: 106 test files / 714 tests

Common merge base:
`53dc61de334c6412c1e5337b4f745c360f69facd`

The histories diverged from this merge base. Neither source branch may be treated as a replacement for the other.

Current consolidation branch is intentionally based on Final Hardening and was identical to:
`31b3397cedbeead0c1cf556297f8534a142e216e`
when this plan was prepared.

## 2. Change-set topology

Compared from the common merge base:

- Security-only changed files: 70
- Hardening-only changed files: 35
- Files changed on both lines: 27
- Of the 27 overlapping files, 6 are byte-identical at both final heads
- 21 overlapping files require an explicit resolution decision

The six already-identical overlaps are:
- `migrations/0026_function_privilege_hardening.sql`
- `migrations/0027_document_integrity.sql`
- `migrations/0028_file_identity_hardening.sql`
- `src/lib/file-integrity.ts`
- `tests/database-function-hardening.test.ts`
- `tests/file-integrity.test.ts`

## 3. Consolidation model

Use Final Hardening as the functional/product/privacy parent.

Overlay all Security-only paths exactly from the Security final head unless a later manual resolution says otherwise.

Create the final consolidated history as a two-parent merge commit:
1. parent 1 = Final Hardening head
2. parent 2 = Security head

This preserves provenance for both completed gates.

Do not squash either source line into an opaque single-parent commit.

## 4. Migration order

The consolidated migration chain must contain, in order:

- 0020_identity_security.sql
- 0021_business_invariants.sql
- 0022_registration_review.sql
- 0023_operations_legal.sql
- 0024_preview_api_lockdown.sql
- 0025_legal_privacy_readiness.sql
- 0026_function_privilege_hardening.sql
- 0027_document_integrity.sql
- 0028_file_identity_hardening.sql

Important:
- 0025 comes from Final Hardening.
- 0026/0027/0028 are already byte-identical between the two final heads.
- no renumbering is required.
- no migration in this consolidation is authorized for Production.

## 5. Overlap resolution matrix

### Security version should win directly

Use the Security final version for:

- `src/app/actions/auth.ts`
  - preserves oversized-password rejection
  - preserves split IP / identity rate-limit handling
  - preserves safer structured error logging

- `src/app/actions/ui-locale.ts`
  - preserves `safeLocalRedirectPath()`
  - blocks external / protocol-relative / backslash redirect tricks

- `src/app/api/documents/[id]/route.ts`
  - preserves SHA verification
  - preserves fail-closed strict disclosure audit
  - preserves Hardening data minimization: no redundant filename PII is reintroduced into durable download audit metadata

- `src/app/api/registrations/[id]/documents/[docId]/route.ts`
  - preserves strict disclosure audit and integrity evidence
  - keeps registration-document audit metadata privacy-minimized

- `src/app/api/topups/[id]/proof/route.ts`
  - preserves strict disclosure audit
  - preserves receipt SHA integrity
  - maps audit failure to 503
  - avoids restoring receipt filename PII into durable audit metadata

- `src/lib/auth.ts`
  - preserves Production `__Host-` session cookie
  - preserves legacy transition cleanup
  - preserves credential-length checks and hardened diagnostics

- `src/lib/documents.ts`
  - preserves transactional review/delete + audit coupling
  - preserves file integrity metadata
  - preserves authoritative-byte upload policy

- `src/lib/storage.ts`
  - exact ESSAFARIA Supabase host pinning
  - Preview/Production bucket separation
  - request timeouts
  - bucket validation
  - SSRF/service-role exfiltration protections

- `src/lib/topup.ts`
  - preserves atomic financial decision + audit behavior
  - preserves receipt fingerprint validation

- `src/lib/types.ts`
  - preserves Production session-cookie constant

- `tests/business-invariants-hardening.test.ts`
  - Security version contains the extra top-up audit rollback proof

### Final Hardening version should win directly

Use Final Hardening for:

- `src/db/schema.ts`
  - functional schema is equivalent; Hardening wording reflects KYC/follow-up usage

- `tests/prod-release-preflight.test.ts`
  - explicitly includes `0025_legal_privacy_readiness.sql` in the set that must remain absent from Production until authorized

- `tests/file-access-hardening.test.ts`
  - keeps the additional content-type assertions while retaining the same tamper tests

- `tests/topup-proof-integrity.test.ts`
  - keeps the more precise immutable-trigger error assertions

### Manual semantic merge required

The following files must not be resolved by whole-file winner selection:

#### `.github/workflows/preview-verify.yml`

Final resolution:
- `contents: read`
- immutable SHA-pinned GitHub Actions
- no repository comment/write permission
- current-SHA deployment remains the only hosted proof for the current RC
- Hardening stale-ancestor fallback is retained only as an explicitly labelled **STALE SAME-BRANCH DIAGNOSTIC**
- a stale deployment can never be represented as current-SHA validation
- triggers include Final Hardening, Security and the consolidation branch plus relevant `src/**` / `migrations/**` paths

#### `.github/workflows/rc-verification.yml`

Use Security as the base:
- pinned checkout/setup-node SHAs
- tracked-secret gate
- history-secret gate
- GitHub Actions pinning gate
- dangerous source AST gate
- production dependency audit
- typecheck
- lint
- build-preview guard
- full suite
- build
- read-only repository permissions

Add Hardening verification:
- shell syntax check for `scripts/privacy-runtime-smoke.sh`
- local legal/privacy runtime smoke
- consolidated branch trigger/if condition

Final workflow must remain non-deploying and credential-free with respect to hosted DBs.

#### `scripts/hosted-verify.sh`

Use Hardening as the functional coverage body, because it contains the richer Legal/Privacy + newest-surface checks.

Prepend/retain Security safety boundary:
- target may only be localhost/127.0.0.1 or `*.vercel.app`
- explicitly reject `visa.essafariavoyages.com`
- explicitly reject arbitrary hosts
- fail before any mutating probe if target boundary is not valid

Retain Security authenticated health assertions:
- Preview must resolve to `visa_os_preview`
- intended Supabase project must match
- security migration ledger must be present

Update the required Preview ledger to include 0025 through 0028.

All direct Production probes were removed from this harness. The target is rejected before the first HTTP request unless it is localhost/127.0.0.1 or `*.vercel.app`. The Production custom domain is present only in the explicit deny-list.

#### `src/app/api/health/route.ts`

Use Security control flow:
- anonymous and Agency calls remain cheap
- anonymous readiness must not open PostgreSQL
- detailed DB/schema/ledger diagnostics restricted to authenticated Staff

Add Hardening legal migration requirement:
- include `0025_legal_privacy_readiness.sql` in the required ledger

Final required ledger therefore includes 0020 through 0028.

#### `src/lib/registrations.ts`

This is the highest-risk semantic merge.

Preserve Final Hardening:
- exact Legal/Privacy consent-version structure and UUID/version/effective-at context
- legal publication readiness behavior
- raw source IP is not persisted in the public partnership record
- rate-limit subject is one-way hashed by the shared limiter
- privacy-minimized audit metadata
- current follow-up/registration product behavior

Preserve Security:
- authoritative byte validation for files
- atomic DB-backed concurrent rate limiting
- fail-closed registration rate limiter
- registration + submission audit in the same transaction
- password policy: 10–200 chars with letters and numbers
- safer structured error logging
- no security regression in tenant/identity behavior

Important combined invariant:
A public registration must be atomically rate-limited and auditable without durably persisting the caller's raw IP in the registration record.

The submission audit should be transactionally coupled while keeping metadata minimized.

#### `tests/agency-registration.test.ts`

Create the union of both proof sets:
- Security concurrent 12-attempt atomic rate-limit test
- normal sequential rate-limit test
- Hardening privacy test proving raw IP is not persisted
- Legal/Privacy consent backstop tests
- existing file validation and anti-automation tests

## 6. Hosted verification policy

The consolidated RC must never use a stale ancestor deployment as proof for the current SHA.

A stale ancestor Preview may be useful only as a clearly labelled diagnostic, never as a PASS for the final RC.

Mutating hosted verification is authorized only against:
- localhost / 127.0.0.1
- a verified `*.vercel.app` Preview

It is never authorized against the Production custom domain.

## 7. Database acceptance

Before any hosted Preview validation:

Preview:
- expected schema: `visa_os_preview`
- expected migration ledger through 0028
- function search_path remains `pg_catalog, visa_os_preview`
- PUBLIC/anon/authenticated function EXECUTE remains revoked

Production:
- expected schema: `visa_os`
- expected ledger remains 19 migrations, last `0019_config_translations.sql`
- 0020–0028 remain absent until a separately authorized Production release

## 8. CI acceptance gate for the consolidated branch

The consolidated branch must pass, on one exact HEAD:

- tracked secret gate
- full Git history secret gate
- immutable Action pinning gate
- dangerous source AST gate
- production dependency audit
- typecheck
- lint
- build-preview guard
- complete deterministic test suite
- Next.js production build without deployment/DB access
- legal/privacy runtime smoke

Existing green baselines that must not regress:
- Hardening: 92 files / 652 tests + privacy runtime smoke
- Security: 106 files / 714 tests

The final consolidated test suite must preserve the union of both proof families.
Do not accept a lower count merely because one source branch's tests were overwritten.

## 9. No-redo list

Do not restart completed audits for:
- tenant isolation
- Server Action authorization
- session invalidation
- wallet concurrency/exactly-once
- file magic validation
- SHA-256 file integrity
- blob/file identity immutability
- security headers
- redirects
- rate limits
- request-body caps
- secret scanning
- Action SHA pinning
- DB function privileges
- legal version immutability
- privacy publication readiness

The consolidation task is integration + regression verification, not a new architecture pass.

## 10. Production safety

During this consolidation:
- no Production deploy
- no Production migration
- no Production seed
- no Production reset
- no destructive Production test
- no release sentinel
- no mutation of `release/essafaria-rc-2026-09`

Only read-only Production postflight evidence is allowed.

## 11. Final target

The consolidated RC lineage must:
- preserve both source histories through a real two-parent merge point
- contain Final Hardening product/privacy behavior
- contain Security hardening and CI guards
- contain migration chain through 0028 for Preview
- be green under the combined deterministic gate
- remain non-deployed until explicit hosted Preview verification is authorized

## 12. Executed consolidation result

The planned 3-way consolidation was executed on `rc/final-hardening-security-consolidation`.

Actual topology resolved from merge-base `53dc61de334c6412c1e5337b4f745c360f69facd`:

- 70 Security-only files integrated without modification;
- 35 Hardening-only files preserved from the functional/privacy parent;
- 6 overlapping blobs were already byte-identical;
- 21 true overlaps were semantically resolved.

Resolution principle used throughout:

**Security enforcement + Final Hardening product/privacy behavior + no PII regression.**

Notable combined results:

- Security fail-closed download auditing + Hardening privacy-minimized audit metadata;
- registration Legal consent model + raw-IP minimization + DB-backed atomic abuse controls + transactional submission audit;
- receipt SHA integrity + immutable top-up identity + transactional CREDIT and REJECT financial audits;
- Production `__Host-` session cookie + hardened login/rate-limit behavior;
- cheap anonymous health + Staff-only detailed diagnostics + required Legal/Security ledger through 0028;
- strict Supabase project/host/bucket separation while retaining the verified `documents` storage bucket default;
- Security CI gates + Final Hardening Legal/Privacy runtime smoke;
- hosted verifier now refuses Production before any HTTP probe.

Verified consolidated snapshot before the history-sealing merge marker:

`3f999ba2a14a2f30f86987b4c616398f25f34d0f`

GitHub Actions run:

`37208337190` — **SUCCESS**

Evidence:

- tracked-secret gate: PASS — 430 tracked files;
- Git-history secret gate: PASS — 1,089 revisions;
- immutable GitHub Actions gate: PASS — 7 workflow files;
- source-sink AST gate: PASS — 194 source files;
- production dependency audit: PASS — 0 vulnerabilities;
- typecheck: PASS;
- lint: PASS;
- shell harness syntax: PASS;
- Preview build-write guard: PASS;
- complete deterministic suite: **107/107 test files, 727/727 tests PASS**;
- Next.js production build without deployment/database access: PASS;
- local Legal/Privacy runtime smoke: PASS.

No Production deployment or migration was performed by this consolidation.


## 13. Sealed merge and final evidence

The two source histories are now formally joined by merge commit:

`232ec37a578a59ac1b1a9a57c7c5e9ff563ef2a0`

Parents:

1. consolidated Final Hardening lineage: `429b97de296399e977a8f695ea1fca1444f5feb2`
2. final Security head: `5d8aebe9648fe2c121df0693f033e84c7ac6611e`

Git ancestry verification:

- `preprod/essafaria-final-hardening` is an ancestor of the consolidated RC;
- `security/pre-codex-gate-2026-10-03` is an ancestor of the consolidated RC;
- neither source lineage is left behind.

Final deterministic verification on the sealed two-parent merge:

GitHub Actions run `37208612598` — **SUCCESS**

- tracked-secret gate: PASS — 430 tracked files;
- full Git-history secret gate: PASS — 1,091 revisions;
- immutable GitHub Actions pinning gate: PASS — 7 workflow files;
- dangerous source AST gate: PASS — 194 source files;
- production dependency audit: PASS — 0 vulnerabilities;
- typecheck: PASS;
- lint: PASS;
- hosted/privacy shell syntax: PASS;
- targeted Preview build-write guard: PASS;
- deterministic suite: **107/107 test files, 727/727 tests PASS**;
- Next.js production build: PASS;
- local Legal/Privacy runtime smoke: PASS.

Hosted runtime evidence was also obtained against the current consolidated application snapshot
`3f999ba2a14a2f30f86987b4c616398f25f34d0f`
before documentation-only/history-sealing commits. Application source is unchanged by those later commits.

Hosted Preview run `37208337208` — **SUCCESS**:

- current-SHA Preview resolved successfully (not stale fallback);
- authenticated safety boundary confirmed `visa_os_preview`;
- intended ESSAFARIA Supabase project confirmed;
- migrations 0025–0028 confirmed;
- hosted checks: **41 PASS / 0 FAIL / 60 SKIP**.

The SKIP count reflects checks whose runtime prerequisites were unavailable and is not represented as proof for those skipped controls.

Read-only database postflight after consolidation:

- Preview `visa_os_preview`: 28 migrations, last `0028_file_identity_hardening.sql`;
- Production `visa_os`: 19 migrations, last `0019_config_translations.sql`;
- unsafe Preview application functions under search_path/EXECUTE policy: **0**.

No Production deployment, migration, seed, reset, destructive test or release-sentinel action was performed during this consolidation.

### Consolidation verdict

**FINAL RC HARDENING + SECURITY CONSOLIDATION: PASS**

The branch is technically consolidated and verified. Any later promotion into the authoritative release branch remains a separate release operation and is not performed by this consolidation.
