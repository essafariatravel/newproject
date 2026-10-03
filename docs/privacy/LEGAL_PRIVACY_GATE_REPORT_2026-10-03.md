# ESSAFARIA VISA OS — Legal / Privacy / Data Governance Gate Report

Date: 2026-10-03

## Final verdict

**TECHNICAL LEGAL / PRIVACY GATE: PASS**

**PREVIEW DATABASE READINESS: PASS**

**LOCAL BUILT-RUNTIME HTTP/DB QA: PASS**

**HOSTED VERCEL PREVIEW QA: PASS**

**PRODUCTION ISOLATION: PASS — Production was not migrated or deployed by this gate**

Remaining blockers are human/governance inputs, not unfinished engineering:

- approved Privacy Notice EN / FR / AR;
- approved Terms of Service EN / FR / AR;
- approved effective dates for those documents;
- approved retention decisions;
- legal/privacy contact and applicable rights/request wording;
- vendor/DPA/international-transfer conclusions where required;
- Owner decision on whether to keep the current broad V1 Staff operational perimeter or introduce additional separation of duties;
- Owner/legal decision for future legal-update enforcement mode (informational / acknowledgement / re-acceptance / blocking).

No remaining Legal/Privacy implementation should be delegated to Codex.

## Integrated repository state

Authoritative branch for this gate:

`preprod/essafaria-final-hardening`

Legal/privacy work was developed on:

`hardening/legal-privacy-readiness-v2`

and integrated by PR #12.

PR #12 merge commit:

`8a27eb1934e14f2d29a2d8f862f0a6c1c4370698`

Application SHA with full deterministic + current-SHA hosted validation:

`91388f0a049b2f9138a1cdd3b93ef8ff10b92a34`

Final technical SHA with deterministic validation, local built-runtime validation and privacy-log regression guards:

`391b05c0e317ac2dbf25aae1b536cb10f38dbba6`

The immediately preceding hosted-harness SHA was:

`20aca63ebcb64c7da437775a37d3385fa7b3f6b9`

The latter changes verification only; when its own Vercel build was quota-limited, the workflow safely exercised the current harness against the already-successful ancestor Preview at `91388f0a...`, explicitly labelled as a stale diagnostic rather than current-SHA deployment validation.

## Implemented legal-content controls

The product now uses immutable versioned legal content instead of mutable site copy.

Implemented:

- immutable `legal_versions` history;
- approved `effective_at` separated from actual `published_at`;
- active-vs-latest legal-version reads;
- future-effective published versions do not become active early;
- publication restricted to `SUPER_ADMIN`;
- engineering never records a fabricated lawyer/Owner approval event;
- published content cannot be UPDATEd or DELETEd in place;
- EN / FR / AR are independent legal artifacts;
- no silent legal-text fallback between languages;
- public Privacy/Terms pages render only approved effective versions;
- unavailable legal pages fail closed and are `noindex`;
- no build/deployment timestamp is used as a legal effective date.

## Registration privacy-by-default

The public first-contact agency request is intentionally minimal.

New first contact collects only the operational contact information currently required by the product, including:

- agency/legal name;
- primary contact name;
- professional/shared agency email;
- phone / WhatsApp;
- optional city;
- Terms acceptance;
- Privacy Notice acknowledgement;
- accuracy confirmation;
- exact legal-version evidence;
- existing anti-abuse/security metadata.

It does **not** request initial:

- full postal address;
- commercial registration number;
- tax identifier;
- agency licence;
- monthly visa volume;
- main-market profiling;
- company/KYC files.

Administrative evidence is requested later only when needed through the existing authorized Staff follow-up workflow with scoped, expiring, hashed links.

Historical nullable fields remain for backward compatibility; minimizing the new form does not destroy old records.

## Exact Terms / Privacy evidence

Registration verifies the exact legal content that was rendered.

Evidence now includes:

- Terms UUID;
- Terms version number;
- Terms effective date;
- Privacy UUID;
- Privacy version number;
- Privacy effective date;
- locale;
- registration record linkage.

Separate durable audit events are generated:

- `TERMS_ACCEPTED`
- `PRIVACY_NOTICE_ACKNOWLEDGED`

Cookie consent, analytics consent and marketing consent are not inferred from either event.

Staff registration review shows the captured legal evidence.

## Data minimization / logging

Public registration uses a strict field whitelist.

Injected legacy KYC fields and mass-assignment fields are ignored.

Public authentication/registration error logging is reduced to safe technical codes rather than dumping raw error objects. A regression guard now covers both the public login page and authentication server action.

Sensitive application/document/wallet payloads are not intentionally copied into general telemetry by this gate.

## Browser storage / tracking

Current documented browser inventory:

- `evos_session` — first-party authenticated session cookie;
- `evos_ui_locale` — first-party locale preference;
- `essafaria.notification-sound` — localStorage `on/off` preference only.

No sessionStorage use is inventoried.

No common analytics/advertising SDK is present in the dependency set reviewed by the gate.

No cosmetic cookie banner was added.

A regression guard prevents silent introduction of unreviewed browser-storage keys or common tracking SDKs.

UTM guidance explicitly prohibits applicant, passport, dossier-private, account, email/phone, financial and private-status information.

## Supabase / database facts

Connected project:

`xgetzgixalrsmuvfthpf`

Verified project region at review time:

`us-east-1`

Verified organization plan at review time:

Free.

Application schemas:

- Production: `visa_os`
- Preview: `visa_os_preview`

Verified database-access architecture:

- application source uses server-side PostgreSQL / Drizzle;
- Supabase roles `anon` and `authenticated` have no `USAGE` on `visa_os_preview`;
- the same direct Data API exposure is not relied upon by the application.

Storage facts verified during the gate:

- `documents` bucket is private;
- `website-media` bucket is public;
- optional Supabase document-storage default was aligned to `documents`.

These are technical facts only. They are not legal controller/processor, transfer-mechanism or adequacy conclusions.

## Preview migrations

Verified on `visa_os_preview`:

- `0020_identity_security.sql`
- `0021_business_invariants.sql`
- `0022_registration_review.sql`
- `0023_operations_legal.sql`
- `0024_preview_api_lockdown.sql`
- `0025_legal_privacy_readiness.sql`
- `0026_function_privilege_hardening.sql`

Final read-only verification on 2026-10-03 confirmed:

- Preview last migration: `0026_function_privilege_hardening.sql`;
- `0025`: present;
- `0026`: present;
- `legal_versions.effective_at`: present and NOT NULL;
- approved legal-version row count in Preview: **0**;
- `anon` schema USAGE: false;
- `authenticated` schema USAGE: false;
- application-schema function count: 11;
- functions executable by PUBLIC: 0;
- application functions with unpinned search path: 0.

A transactional Preview test also proved:

- UPDATE of a legal-version row is blocked;
- DELETE of a legal-version row is blocked;
- the test transaction rolled back;
- zero synthetic test rows remained.

## Production isolation

Final read-only Production verification confirmed:

- Production schema: `visa_os`;
- migration count: 19;
- last migration: `0019_config_translations.sql`;
- `0025`: absent;
- `0026`: absent;
- `legal_versions.effective_at`: absent.

Therefore this gate did **not** migrate Production.

No Production deployment was performed by this gate.

The hosted diagnostic also identified that the currently deployed legacy Production build still exposes the older detailed `/api/health` response. The hardened preprod implementation already redacts anonymous DB/schema diagnostics. The hosted harness no longer reprints those Production infrastructure details and classifies the legacy condition as a SKIP/pending normal future release rather than as an acceptable privacy pattern.

Production must not be hot-patched solely from this gate.

## Deterministic verification

GitHub Actions workflow:

`RC deterministic verification`

Final run:

**#207**

Verified SHA:

`391b05c0e317ac2dbf25aae1b536cb10f38dbba6`

Result:

**SUCCESS**

Evidence:

- exact checkout: PASS;
- TypeScript: PASS;
- ESLint: PASS;
- shell harness syntax: PASS;
- targeted build/Preview guard: **5 / 5 tests PASS**;
- broader deterministic suite: **90 test files PASS**;
- total tests: **640 / 640 PASS**;
- Next.js build: PASS;
- local legal/privacy runtime smoke: PASS.

The additional test introduced after RC #196 prevents public auth/login paths from returning to raw `console.error(..., err)` logging.

## Local built-runtime privacy smoke

The RC workflow starts an isolated PostgreSQL instance, applies migrations, seeds synthetic local data, starts the built Next.js application and executes real HTTP requests.

Verified:

- Privacy unavailable state renders;
- unavailable Privacy is noindex;
- Terms unavailable state renders;
- unavailable Terms is noindex;
- registration remains closed when approved legal versions are absent;
- no registration form is rendered in that state;
- synthetic LOCAL-ONLY EN/FR/AR legal fixtures can exercise the published path;
- published Privacy renders version evidence;
- published Terms renders version evidence;
- FR legal version resolves independently;
- AR legal version resolves independently;
- AR is RTL;
- exact Terms/Privacy UUIDs are rendered into registration;
- first-contact controls contain no KYC/document/full-address fields;
- a real HTTP Next Server Action registration succeeds when synthetic legal versions exist;
- intentionally injected legacy KYC/mass-assignment values remain unpersisted;
- persisted consent evidence contains the exact legal UUIDs;
- separate Terms/Privacy audit evidence contains the exact version IDs.

Synthetic legal fixtures exist only in the disposable embedded test database.

They are not Preview/Production legal content.

## Hosted Vercel Preview verification

Vercel ultimately produced a deployment for the exact verified SHA:

`91388f0a049b2f9138a1cdd3b93ef8ff10b92a34`

Hosted verification workflow:

`Hosted Phase-2 Preview verification`

Current-SHA application run:

**#35 — SUCCESS — 39 PASS / 0 FAIL / 62 SKIP**

Additional live privacy/browser diagnostic with the final hardened harness:

**#36 — SUCCESS — 41 PASS / 0 FAIL / 62 SKIP**

A later hosted run (**#38**) re-exercised the same live privacy/browser harness after the public login logging hardening and also completed successfully.

Run #36 used the successful same-lineage Preview at `91388f0a...` because the harness-only commit itself was temporarily Vercel-rate-limited. The workflow explicitly labels that mode as a stale diagnostic and never represents it as a deployment validation of the newer SHA.

The SKIPs are primarily intentional consequences of the legal publication blocker:

- Preview currently has zero approved legal versions;
- public agency onboarding is therefore deliberately closed;
- no new agency account is provisioned through that public flow;
- agency-session-only downstream tests are skipped rather than falsified.

Hosted PASS evidence includes:

- current Preview resolves and answers;
- anonymous health is redacted;
- EN registration surface renders;
- FR registration surface renders;
- AR registration surface renders with RTL;
- registration fails closed while approved legal versions are absent;
- unknown Preview credentials produce the normal invalid-credentials path rather than a DB/service failure;
- anonymous registration-document access is denied;
- dedicated Staff Preview login succeeds;
- unauthenticated `/portal` does not leak content;
- unauthenticated `/admin` does not leak content;
- Staff billing aggregates render;
- Staff session cannot export an agency wallet;
- Staff application CSV export is valid Excel-compatible CSV;
- Staff application XLSX export is a real XLSX;
- anonymous Staff export is refused;
- Staff work queue exposes only the safe bulk controls;
- no bulk approve/reject/debit/delete control is present;
- staff page-size controls and saved views render;
- visa-type editor sections render;
- visa-type editor remains DZD-only;
- Admin Settings exposes independent website/branding saves and controlled legal publication;
- Arabic legal field is RTL;
- Privacy pages render in EN / FR / AR;
- FR Privacy heading is localized;
- AR Privacy heading is localized and RTL;
- final Preview health remains OK;
- deployed `evos_session` cookie is actually emitted with `HttpOnly`, `Secure`, `SameSite=Lax` and `Path=/`;
- public homepage HTML contains no common analytics/advertising marker;
- Production bogus-login read-only smoke returns normal invalid-credentials behavior.

## Vercel quota resilience

During this work Vercel intermittently returned the Free-plan daily deployment/build quota.

The hosted workflow now handles this safely:

- a quota is never reported as a product regression;
- it first looks for a successful same-lineage Preview;
- Git ancestry must prove the fallback SHA is an ancestor of the current preprod HEAD;
- stale diagnostics are explicitly labelled and never presented as current-SHA deployment validation;
- when the current SHA is deployable, the workflow verifies that current deployment normally.

This eliminated the remaining need for a human/Codex agent to reinterpret quota failures.

## Governance package

The repository now contains:

- `docs/privacy/LEGAL_PRIVACY_GATE_REPORT_2026-10-03.md`
- `docs/privacy/browser-storage-inventory.md`
- `docs/privacy/data-governance.md`
- `docs/privacy/vendor-inventory.md`
- `docs/privacy/owner-legal-handoff.md`
- `docs/privacy/data-flow-map.md`
- `docs/privacy/access-need-to-know.md`
- `docs/privacy/retention-decision-register.md`
- `docs/privacy/privacy-request-incident-runbook.md`

No statutory retention duration or legal conclusion is fabricated in those files.

## Decisions intentionally not automated by engineering

### OWNER BUSINESS DECISION

Current V1 Staff authorization deliberately uses a broad operational Staff perimeter for ADMIN / VISA_AGENT / ACCOUNTING except specific account-management/recovery powers.

Changing that into additional separation of duties can affect daily operations and must be explicitly approved by the Owner.

### OWNER + LEGAL REVIEW DECISION

For a future material legal-document change, decide whether the product should use:

- informational notice;
- explicit acknowledgement;
- re-acceptance;
- block-until-accepted.

Engineering must not infer that mode from text differences.

### LEGAL REVIEW REQUIRED

Legal counsel / approved professional review must determine, as applicable:

- final legal text;
- lawful/contractual basis wording;
- privacy-rights wording;
- complaint/escalation wording;
- retention criteria/durations;
- incident notification obligations;
- vendor roles;
- DPA requirements;
- international-transfer mechanisms.

### EXTERNAL CONFIGURATION / CONTRACT REVIEW

Vercel/Supabase contract/DPA/subprocessor/log-retention settings and any future SMTP/monitoring provider require the appropriate account/contract review.

## Launch blocker

**OWNER-APPROVED EN / FR / AR PRIVACY NOTICE AND TERMS OF SERVICE CONTENT IS STILL MISSING.**

Preview currently has zero legal versions by design.

Engineering correctly fails closed instead of publishing invented text.

The Owner/legal input template is:

`docs/privacy/owner-legal-handoff.md`

## Codex handoff

**No Legal/Privacy engineering implementation remains for Codex.**

Codex should not:

- recreate this architecture;
- invent Privacy/Terms text;
- invent retention periods;
- add a cosmetic cookie banner;
- weaken health redaction;
- reopen public KYC collection;
- change immutable financial/legal history;
- apply `0025`/`0026` to Production without the normal release authorization.

Any future work in this gate begins only when Owner/legal decisions or approved legal content change the requirements.
