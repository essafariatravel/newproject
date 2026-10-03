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
- full deterministic test suite: PASS;
- Next.js build with no deployment/database access: PASS.

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
- optionally make audit persistence fail-closed for lower-risk general branding/configuration mutations as well as the already-hardened security-critical mutations.

## Gate verdict

**CODE + ISOLATED PREVIEW DATABASE SECURITY GATE: PASS**

**FULL HOSTED SECURITY GATE: PENDING VERIFIED PREVIEW RUNTIME TESTING**
