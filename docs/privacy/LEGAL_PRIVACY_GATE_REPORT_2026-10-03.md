# ESSAFARIA VISA OS — Legal / Privacy / Data Governance Gate Report

Date: 2026-10-03

## Final integration state

Integrated branch: `preprod/essafaria-final-hardening`

Legal/privacy feature branch: `hardening/legal-privacy-readiness-v2`

Merged PR: #12 — Legal, privacy and data governance readiness

Merge commit: `8a27eb1934e14f2d29a2d8f862f0a6c1c4370698`

Production was not deployed or migrated by this gate.

## Technical result

Implemented:
- immutable legal-version history;
- approved legal effective date separated from publication timestamp;
- active-vs-latest legal-version reads;
- SUPER_ADMIN-only legal publication control;
- no fabricated owner/legal review evidence;
- EN / FR / AR legal publication support without silent legal-text fallback;
- noindex behavior when approved legal content is unavailable;
- exact Terms + Privacy version UUID/number/effective-date evidence at agency registration;
- separate `TERMS_ACCEPTED` and `PRIVACY_NOTICE_ACKNOWLEDGED` audit events;
- minimized public agency first-contact fields;
- no KYC/admin-document upload during first contact;
- existing scoped Staff-issued administrative follow-up document workflow retained;
- staff visibility of consent/version evidence;
- public auth/registration error logging reduced to safe technical codes;
- browser storage/cookie/tracking inventory;
- vendor/data-location inventory;
- Owner/legal decision register;
- privacy/data-governance baseline;
- regression guards for storage/tracking/legal-publication/minimal intake;
- private Supabase document-bucket default aligned to verified `documents` bucket.

## Database migrations

### Preview

Verified on project `xgetzgixalrsmuvfthpf`, schema `visa_os_preview`:

- `0020_identity_security.sql`
- `0021_business_invariants.sql`
- `0022_registration_review.sql`
- `0023_operations_legal.sql`
- `0024_preview_api_lockdown.sql`
- `0025_legal_privacy_readiness.sql`
- `0026_function_privilege_hardening.sql`

`0025` adds `legal_versions.effective_at` and preserves immutable legal history.

`0026` pins application-function search paths and removes PUBLIC / anon / authenticated function execution in the application schema.

Preview verification evidence:
- legal_versions effective_at exists and is NOT NULL;
- legal_versions immutable trigger exists for UPDATE and DELETE;
- transactional update/delete attempts were blocked;
- transaction rolled back with zero residual test rows;
- 11 application-schema functions inspected;
- PUBLIC EXECUTE count = 0;
- unpinned search_path count = 0.

### Production

Verified read-only on schema `visa_os`:
- migration count = 19;
- last migration = `0019_config_translations.sql`;
- `0025` absent;
- `0026` absent;
- legal_versions.effective_at absent.

Therefore Production remained untouched by this gate.

## Supabase architecture facts

Verified project region: `us-east-1`.

Verified organization plan at review time: Free.

Application schemas:
- `visa_os`
- `visa_os_preview`

Verified on 2026-10-03:
- Supabase roles `anon` and `authenticated` have no USAGE on either application schema;
- bucket `documents` is private;
- bucket `website-media` is public;
- application source uses server-side node-postgres + Drizzle rather than browser Supabase Auth/JS.

These are technical facts only, not legal transfer/controller/processor conclusions.

## Verification evidence

Feature-head deterministic gate passed before integration:
- TypeScript: PASS
- ESLint: PASS
- targeted legal/privacy tests: PASS
- migration safety: PASS
- full deterministic test suite: PASS
- Next.js build: PASS

The final feature-head run was GitHub Actions `Legal Privacy deterministic verification` run #23 on:
`df5effc8d54c59db8f4c99e5c1b55a8fa73b9bec`.

Preprod post-merge verification is performed by the repository's existing `RC deterministic verification` workflow on merge commit:
`8a27eb1934e14f2d29a2d8f862f0a6c1c4370698`.

## Runtime validation

The preprod RC workflow now starts an isolated PostgreSQL instance, applies all migrations through 0026, seeds only local synthetic data, starts the built Next.js application and executes `scripts/privacy-runtime-smoke.sh` over real HTTP.

Verified in RC deterministic verification run #124 on commit `946470fda2720d21a1fcd7d211c67d7bf8597cee`:
- unpublished Privacy page renders fail-closed state;
- unpublished Privacy page is noindex;
- unpublished Terms page renders fail-closed state;
- unpublished Terms page is noindex;
- agency registration is closed while approved legal versions are missing;
- no registration form is rendered in that state;
- synthetic local-only EN/FR/AR legal versions can be inserted for disposable runtime testing;
- active Privacy/Terms versions render with their version number;
- published Privacy page becomes indexable by page metadata;
- FR version resolves independently;
- AR version resolves independently with RTL;
- registration contains exact legal-version UUIDs;
- real first-contact controls contain no address/KYC/document upload fields;
- a real HTTP Next server-action registration succeeds;
- injected legacy KYC and mass-assignment fields remain unpersisted;
- persisted legal consent evidence contains the exact version IDs;
- `TERMS_ACCEPTED` and `PRIVACY_NOTICE_ACKNOWLEDGED` audit events contain the exact legal-version IDs.

The runtime work also exposed and fixed a demo-seed defect: the seed attempted to UPDATE an immutable wallet transaction after submission. The stable demo application reference is now assigned before submission, so immutable ledger history is never rewritten.

Legacy invented Privacy/Terms strings were removed from the demo seed.

### Hosted Vercel Preview

A new Vercel Preview deployment remains externally unavailable because Vercel returned a daily deployment/build quota error (`api-deployments-free-per-day`).

The hosted verification workflow is now:
- enabled for `preprod/essafaria-final-hardening`;
- aligned with minimized first-contact onboarding;
- aware that registration must fail closed when approved legal content is absent;
- aware of migrations 0020–0026;
- quota-aware: a verified Vercel build/deployment quota is reported as SKIP rather than a false product FAIL;
- ready to run automatically on future preprod source/migration changes once Vercel can create a Preview.

Do not bypass the quota by touching Production.

The only check that inherently still requires a real hosted browser/network environment is final deployed inspection of actual cookies/storage/network requests. This is an external-environment validation, not remaining Codex implementation.

## Governance package

Additional decision-ready operational documents:
- `docs/privacy/data-flow-map.md`
- `docs/privacy/access-need-to-know.md`
- `docs/privacy/retention-decision-register.md`
- `docs/privacy/privacy-request-incident-runbook.md`

The current code intentionally gives ADMIN, VISA_AGENT and ACCOUNTING a shared operational Staff perimeter except account management/recovery. Whether to retain that V1 model or introduce separation of duties is explicitly an **OWNER BUSINESS DECISION**, not an engineering/Codex inference.

Legal update enforcement (informational vs acknowledgement vs re-acceptance vs blocking) is also explicitly an **OWNER + LEGAL REVIEW DECISION**.

## Owner / legal blocker

There are currently zero approved legal versions in Preview.

Engineering must not fabricate Privacy Notice or Terms content.

Before launch, Owner/legal counsel must provide the approved:
- Terms text EN / FR / AR;
- Privacy Notice text EN / FR / AR;
- effective dates;
- retention decisions;
- legal entity/privacy contact details;
- applicable rights/request wording;
- vendor/transfer/DPA conclusions as required.

The exact decision template is:
`docs/privacy/owner-legal-handoff.md`.

## Gate verdict

Technical implementation: **PASS**

Database Preview readiness: **PASS**

Production isolation: **PASS**

Deterministic tests/build: **PASS**

Local built-runtime HTTP/DB QA: **PASS**

Hosted Vercel browser/network QA: **BLOCKED EXTERNALLY BY VERCEL DAILY BUILD QUOTA**

Legal content approval / retention / legal-update enforcement: **BLOCKED ON OWNER / LEGAL INPUT**

Staff separation-of-duties choice: **OWNER BUSINESS DECISION REQUIRED**

No remaining Legal/Privacy engineering implementation should be delegated to Codex. The hosted check can run automatically when Vercel is able to create a Preview.
