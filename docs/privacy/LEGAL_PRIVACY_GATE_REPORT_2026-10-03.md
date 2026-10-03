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

## Browser/runtime validation

A new Vercel Preview deployment could not be created at the end of this gate because Vercel returned:

`api-deployments-free-per-day` — more than 100 deployments / daily build limit.

This is an external account quota, not a compilation/test failure.

Do not bypass this by touching Production.

When Vercel quota becomes available, the already-merged preprod commit should receive the normal Preview deployment and the remaining runtime check is limited to:
- browser cookies/storage actual values/attributes;
- /privacy and /terms rendering for approved content;
- registration blocked when legal content is missing;
- registration exact legal-version evidence when approved content exists;
- no unexpected third-party tracking/network requests;
- staff display of consent evidence.

No Codex code implementation is required for those checks.

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

Hosted browser Preview QA: **BLOCKED EXTERNALLY BY VERCEL DAILY BUILD QUOTA**

Legal content approval: **BLOCKED ON OWNER / LEGAL INPUT**

No remaining engineering implementation in this gate should be delegated to Codex.
