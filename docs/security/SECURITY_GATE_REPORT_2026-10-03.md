# ESSAFARIA VISA OS — Security Abuse & Penetration Gate

**Date:** 2026-10-03  
**Branch:** `security/pre-codex-gate-2026-10-03`  
**Baseline:** `preprod/essafaria-final-hardening@53dc61de334c6412c1e5337b4f745c360f69facd`  
**Production destructive actions:** NONE  
**Production schema mutations:** NONE  
**Status:** CODE + ISOLATED PREVIEW DATABASE GATE PASS; HOSTED PREVIEW RUNTIME/BROWSER GATE PENDING

## Executive result

The security gate was implemented on an isolated branch instead of re-auditing the whole product in Codex.

Release-critical paths were hardened and regression-tested around:

- tenant isolation / IDOR;
- exported Server Action authorization;
- Agency-to-Staff privilege boundaries;
- session/recovery behavior;
- immutable and non-negative wallet behavior;
- replay/concurrency/idempotency;
- top-up exactly-once processing;
- transactionally coupled audit evidence for security-critical mutations;
- final decision/document invariants;
- private file access and upload format validation;
- public registration rate limiting;
- unsafe redirects;
- token-page caching/referrer leakage;
- security headers;
- secret scanning (current tree + Git history);
- dependency vulnerability gating;
- Preview bootstrap retirement;
- database function privileges and search_path hardening.

## Deterministic verification

The final non-deploying GitHub verification workflow passes with least-privilege repository permissions:

- tracked-secret gate: PASS;
- Git-history secret gate: PASS;
- production dependency audit (high severity threshold): PASS;
- TypeScript typecheck: PASS;
- lint: PASS;
- protected Preview build-write guard: PASS;
- full deterministic test suite: PASS — **100 test files / 689 tests** on verified code snapshot `190f52dfe9be05fe247b890fac52d12e8a3dd5e3`;
- Next.js production build with no deployment/database access: PASS;
- immutable third-party GitHub Actions gate: PASS — 6 workflow files;
- dangerous source construct AST gate: PASS — 193 source files;
- tracked-tree secret scan: PASS — 404 tracked files;
- Git-history secret scan: PASS — 835 revisions.

The security branch is explicitly excluded from automatic Vercel deployment and from automatic Preview database migration/seeding.

## Important fixes delivered

### Authorization and tenancy

- Direct exported dossier-read Server Actions now authenticate and enforce tenant ownership.
- Static regression guard rejects future non-public Server Actions without an explicit auth boundary.
- Submitted applicant data is locked from direct mutation.
- Staff assignment validates that the target is an active ESSAFARIA Staff identity, never an Agency identity.
- Existing application/document/wallet/message/notification/top-up tenant tests remain in the full suite.

### Financial integrity

- Wallet mutation + audit evidence share one transaction.
- Application submission charge + audit share one transaction.
- Pricing adjustment + audit share one transaction.
- Top-up rejection + audit share one transaction.
- Top-up credit remains exactly-once and transactionally tied to its ledger row.
- Regression probes deliberately force audit failure and verify rollback.
- Existing concurrent wallet/submission tests prove non-negative balance and duplicate-charge prevention.

### Workflow/document integrity

- Application lifecycle security-critical audit writes are transactionally coupled.
- Document review/delete security-critical audit writes are transactionally coupled.
- Communication message + audit persistence is atomic.
- Final decision still requires the official decision document.
- File validation checks extension, declared MIME and magic bytes; active SVG/HTML and traversal-style filenames are rejected.
- Private downloads use attachment + no-store + nosniff and tenant authorization.

### Authentication / recovery

- Suspended accounts/agencies cannot continue through old sessions.
- Password changes/recovery revoke existing access.
- Login rejects oversized secrets before expensive password hashing.
- Login and recovery use shared DB-backed rate limits.
- Once an IP is blocked, attacker-controlled identity counters are no longer allowed to grow without bound.
- Rate-limit cleanup is bounded and indexed.
- The historical remote Preview SUPER_ADMIN bootstrap endpoint is permanently 404.

### Browser / HTTP security

Global structural protections include:

- HSTS;
- DENY framing plus CSP `frame-ancestors 'none'`;
- `object-src 'none'`;
- `base-uri 'self'`;
- `form-action 'self'`;
- `X-Content-Type-Options: nosniff`;
- restrictive Permissions-Policy.

Authenticated and bearer-token identity pages are non-cacheable and non-indexable. Token URLs use `Referrer-Policy: no-referrer`.

Protocol-relative/external form return paths are normalized to same-origin application paths.

### Secrets / supply chain

CI now fails on:

- tracked environment/private-key credential artifacts;
- high-confidence live token signatures;
- non-local committed PostgreSQL URLs;
- sensitive `NEXT_PUBLIC_*` assignments;
- matching secret signatures anywhere in Git history;
- high-severity production dependency audit findings.

No secret values are printed by the gates.

All third-party GitHub Actions are pinned to immutable commit SHAs. GitHub-owned checkout/setup-node actions were moved to their Node 24-capable v5 majors while remaining SHA-pinned. Production dependency installation is lockfile-authoritative (`npm ci`) with no flexible fallback install.

## Extended hardening pass

After the initial security gate passed, an additional abuse/supply-chain pass was completed instead of leaving it to Codex.

### CI/CD and supply-chain

- Every third-party GitHub Action used by repository workflows is pinned to an immutable commit SHA.
- A permanent CI gate rejects future tag/branch-based third-party Action references.
- Action majors were moved to the current pinned Node 24-based releases where applicable.
- The Production release workflow can enter its write path only from `release/essafaria-rc-2026-09` and still requires the explicit `release/PROD_GO` sentinel.
- Production release dependency installation is deterministic via `npm ci` and the committed `package-lock.json`; there is no fallback dependency resolution.
- Production jobs no longer receive repository write permission. Their evidence is written to the GitHub Actions Job Summary.
- Hosted Preview verification also uses read-only repository permissions even when Preview test credentials are present.
- Dedicated tests lock these workflow security invariants against regression.

### Abuse / resource-exhaustion controls

- The agency request API now enforces an authoritative streamed request-body limit even when `Content-Length` is absent or forged.
- Heavy application/report/wallet exports are rate-limited.
- Communication flooding is rate-limited per user and agency.
- The source/sink gate rejects dangerous dynamic-execution constructs and unsafe raw-HTML sinks.
- Mutating API routes are statically checked for an explicit Origin policy, except the intentionally retired hard-404 bootstrap route.

### Enumeration / tenant evidence

- Top-up receipt lookup now has an explicit regression proof that an Agency Admin probing another tenant receives the same non-existence semantics as a random unknown receipt.
- Existing tenant isolation remains enforced for dossiers, applicants, files, messages, notifications, wallets and top-ups.

### Configuration integrity

Workflow configuration is now treated as security-sensitive state:

- status creation/update/toggle/delete and transition add/update/remove are transactionally coupled to their security audit record;
- visa programme creation/update/toggle/delete, including fee and embassy-applicability changes, is transactionally coupled to its audit record;
- forced database audit failures are regression-tested and prove the underlying configuration mutation rolls back.

### Permanent regression manifest

`docs/security/security-regression-manifest.json` now records machine-readable security controls and concrete evidence paths. A test verifies unique stable IDs, existing evidence files and explicit hosted-runtime pending state instead of overstating proof.

## Preview database hardening

A migration-number collision with the parallel Legal/Privacy work was discovered before deployment:

- Legal/Privacy already owns `0025_legal_privacy_readiness.sql`.
- Security migration was therefore renumbered to `0026_function_privilege_hardening.sql`.

`0026` was applied only to `visa_os_preview`.

Postflight proof:

- Preview ledger: through `0026_function_privilege_hardening.sql`;
- Production ledger: remains through `0019_config_translations.sql`;
- Preview tables with RLS disabled: zero;
- Preview table grants to `anon` / `authenticated`: zero;
- every Preview application-schema function now has `search_path=pg_catalog, visa_os_preview`;
- every Preview application-schema function reports PUBLIC/anon/authenticated EXECUTE = false;
- `auth_rate_limits_window_start_idx` exists in Preview;
- Production function privileges/search_path remain unchanged.

Supabase project-wide advisors can still report warnings originating outside `visa_os_preview` (including legacy/public or Production objects). Those were deliberately not modified by this gate.

## Production safety

Production was not deployed, migrated, seeded, reset or penetration-tested.

Read-only before/after checks prove:

- `visa_os.schema_migrations` remains at 19 entries, last `0019_config_translations.sql`;
- `0026_function_privilege_hardening.sql` is absent from Production;
- Production application functions retain their pre-gate configuration.

## External governance/runtime observations

- The connected Vercel account currently exposes no accessible Vercel team to this session, so a real hosted Preview deployment/browser pentest cannot be truthfully performed here.
- The GitHub rulesets API currently returns no repository rulesets. Detailed branch-protection settings cannot be read or changed with the current GitHub App permissions. Repository governance should therefore separately enforce protected RC/main branches, required checks, review policy and no-force-push as appropriate.
- These limitations do not change the code/CI/isolated-Preview-DB verdict; they remain external hosted/governance checks.

## Remaining work for Codex — intentionally small

Codex should **not** restart the security audit.

Only these hosted-runtime tasks remain after the security branch is integrated with the other parallel gate branches:

1. Deploy the consolidated branch to a verified Vercel Preview connected to `visa_os_preview`.
2. Verify Vercel Preview environment-variable separation and confirm no Production DB/storage fallback.
3. Run live browser/HTTP abuse checks that require the deployed application:
   - auth/session cookie behavior;
   - logout/suspension stale-session behavior;
   - direct route/Server Action abuse over real HTTP;
   - cross-tenant ID tampering;
   - private download behavior;
   - security headers/CSP/HSTS;
   - cache/noindex/referrer behavior;
   - concurrent/replay probes against isolated Preview only.
4. Confirm Production remained untouched after the hosted Preview gate.

No destructive test is authorized against Production.

## Non-release-blocking future hardening

These are recommendations, not unresolved release-critical defects from this branch:

- roll out MFA, starting with SUPER_ADMIN / ADMIN / ACCOUNTING and then all Staff;
- add malware/AV scanning or CDR if the document threat model requires it;
- consider a nonce-based full script/style CSP after hosted compatibility testing;
- optionally extend fail-closed audit coupling to remaining low-risk branding/presentation mutations; workflow and visa-programme configuration are now already transactionally audited.

## Gate verdict

**CODE + ISOLATED PREVIEW DATABASE SECURITY GATE: PASS**

**FULL HOSTED SECURITY GATE: PENDING VERIFIED PREVIEW RUNTIME TESTING**


## Final abuse-hardening extension

After the initial gate passed, the branch received an additional adversarial hardening pass.

### Request / DoS boundaries

- `/api/agency/requests` now enforces an authoritative streamed body-size limit even when `Content-Length` is missing or forged.
- communication posting is rate-limited per user and, for Agency accounts, per agency;
- expensive applications/report/wallet exports and wallet-statement generation are rate-limited per authenticated user and return HTTP 429 with `Retry-After`;
- public/authentication limits continue to use the shared PostgreSQL-backed limiter.

### Browser/server input boundaries

- every mutating API route is regression-checked for an explicit Origin policy; the only exemption is the permanently retired hard-404 Preview bootstrap route;
- a syntax-aware CI gate rejects actual JSX `dangerouslySetInnerHTML`, direct `eval()`, and `new Function()`;
- the only raw branding-style sink discovered by that gate was removed: branding CSS is now rendered as text inside `<style>`, not via `dangerouslySetInnerHTML`.

### Enumeration resistance

- top-up receipt access now has regression evidence that a foreign Agency cannot use identifiers to distinguish or retrieve another tenant's proof;
- recovery continues to respond generically for known/unknown identities;
- tenant-facing unauthorized object lookups continue to use non-enumerating behavior where tested.

### Configuration integrity

- workflow status/transition mutations are now coupled transactionally to their audit evidence;
- visa programme fee/applicability configuration mutations are likewise fail-closed when audit persistence fails;
- regression probes deliberately fail audit insertion and prove the business/config mutation rolls back.

### CI/CD least privilege

Production and Preview workflows were additionally hardened:

- Production apply remains restricted to the authoritative release branch and release sentinel;
- dependency installation is deterministic from `package-lock.json`;
- repository write permissions/tokens were removed from Production jobs where not required;
- hosted Preview verification cannot combine test credentials with repository write capability;
- security workflow dependencies are SHA-pinned;
- the security branch remains non-deploying by Vercel configuration.

### Permanent regression manifest

The repository now includes:

`docs/security/security-regression-manifest.json`

and a manifest integrity test. Release-critical controls cannot be called `PROVEN` without named evidence, while hosted Preview controls remain explicitly `HOSTED_PENDING`.

## Access-dependent residual

The connected Vercel integration returned **no accessible teams/projects** during this gate. Therefore the following cannot be truthfully marked proven here:

- Vercel Preview environment-variable isolation;
- a new hosted deployment of the consolidated branch;
- browser-level session/cookie/header/CSP behavior over that deployment;
- real hosted cross-tenant/replay/concurrency probes;
- strict nonce-based CSP compatibility.

These remain the principal Codex/connected-environment tasks.

MFA is also intentionally not force-enabled from this branch. The current custom authentication stack has no MFA subsystem, and mandatory Staff MFA should not be improvised without a protected factor-secret strategy, enrollment/recovery flow, and a verified hosted environment. Recommended rollout remains SUPER_ADMIN first, then ADMIN/ACCOUNTING/VISA_AGENT.

Malware/AV/CDR likewise requires an external scanning capability. The current gate does enforce extension/MIME/magic-byte validation, traversal protection, size caps, and rejection of active HTML/SVG content; external malware scanning remains an integration task rather than a falsely claimed local proof.

## Final evidence snapshot

Verified code snapshot before this report-only update:

`190f52dfe9be05fe247b890fac52d12e8a3dd5e3`

Deterministic CI result: **SUCCESS**

- 100 test files PASS
- 689 tests PASS
- typecheck PASS
- lint PASS
- build PASS
- current-tree secret scan PASS
- 835-revision history secret scan PASS
- immutable GitHub Actions gate PASS
- source-sink AST gate PASS
- dependency vulnerability gate PASS
- Preview build-write guard PASS

Database postflight remains:

- Preview: 26 migrations, last `0026_function_privilege_hardening.sql`;
- Production: 19 migrations, last `0019_config_translations.sql`;
- Security migration 0026 absent from Production.

**Production remains untouched by this security gate.**
