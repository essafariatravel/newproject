# ESSAFARIA VISA OS — Legal / Privacy / Data Governance Gate Report

Date: 2026-10-03

## Final integration state

Authoritative branch: \`preprod/essafaria-final-hardening\`

Original Legal/Privacy feature branch: \`hardening/legal-privacy-readiness-v2\`

Merged PR: #12 — Legal, privacy and data governance readiness

Original merge commit: \`8a27eb1934e14f2d29a2d8f862f0a6c1c4370698\`

This report is maintained on the authoritative preprod branch. Use the branch HEAD plus GitHub Actions as the exact final verification SHA.

Production has not been deployed or migrated by this gate.

## Technical result

Implemented and integrated:
- immutable legal-version history;
- approved legal effective date separated from system publication timestamp;
- active-vs-latest legal-version reads, including future-effective scheduled publication;
- SUPER_ADMIN-only legal publication control;
- no fabricated Owner/Legal review evidence;
- EN / FR / AR legal publication without silent legal-text fallback;
- \`noindex\` behavior when approved legal content is unavailable;
- exact Terms + Privacy UUID/version/effective-date evidence at agency registration;
- separate \`TERMS_ACCEPTED\` and \`PRIVACY_NOTICE_ACKNOWLEDGED\` audit events;
- minimized public agency first-contact fields;
- no KYC/admin-document upload during first contact;
- scoped Staff-issued administrative follow-up document workflow;
- Staff visibility of legal-version evidence;
- public auth/registration/private-file error logging reduced to safe technical signals rather than raw error objects;
- browser cookie/storage/tracking inventory;
- data-flow, need-to-know, retention, privacy-request/incident, vendor and governance registers;
- Owner/Legal decision package;
- A–AK pilot privacy-readiness matrix;
- verification-only future Codex handoff;
- private Supabase document-bucket default aligned to verified \`documents\` bucket;
- production-secure locale preference cookie;
- stored-file integrity metadata and verification synchronized with Preview migrations 0027/0028.

## Database migrations

### Preview

Read-only verification against Supabase project \`xgetzgixalrsmuvfthpf\`, schema \`visa_os_preview\`, confirms the Preview ledger is currently through:

- \`0020_identity_security.sql\`
- \`0021_business_invariants.sql\`
- \`0022_registration_review.sql\`
- \`0023_operations_legal.sql\`
- \`0024_preview_api_lockdown.sql\`
- \`0025_legal_privacy_readiness.sql\`
- \`0026_function_privilege_hardening.sql\`
- \`0027_document_integrity.sql\`
- \`0028_file_identity_hardening.sql\`

Current verified Preview state:
- migration count: 28;
- last migration: \`0028_file_identity_hardening.sql\`;
- \`legal_versions.effective_at\` exists and is NOT NULL;
- approved legal version count: 0;
- application-schema function count: 14;
- PUBLIC EXECUTE count: 0;
- unpinned application-function search-path count: 0;
- Supabase \`anon\` schema USAGE: false;
- Supabase \`authenticated\` schema USAGE: false.

\`0025\` introduces legal effective-date semantics.

\`0026\` removes public/API-role function execution and pins function search paths.

\`0027\` adds SHA-256 identity metadata to visa documents and registration documents.

\`0028\` adds top-up proof SHA-256 metadata and database-level immutable stored-file identity / permanent blob protections.

The source repository was synchronized with 0027/0028 after a drift check found that those Security-gate migrations were already applied to Preview but absent from preprod source. The entire divergent Security branch was deliberately **not** merged; only the coherent file-integrity subset was integrated.

Application behavior now:
- computes SHA-256 at new visa-document upload;
- computes SHA-256 at requested registration-document upload;
- computes SHA-256 at top-up receipt upload;
- validates stored byte length and SHA-256 before private document download;
- validates stored receipt integrity before download;
- validates the same receipt identity before wallet credit;
- rejects permanent stored-byte rewrites through database triggers;
- rejects business metadata identity rewrites for documents/top-up receipts;
- retains size-only compatibility for historical rows whose SHA-256 is null.

### Production

Read-only verification on schema \`visa_os\` confirms:
- migration count: 19;
- last migration: \`0019_config_translations.sql\`;
- \`0025\` absent;
- \`0026\` absent;
- \`legal_versions.effective_at\` absent.

The current Production release manifest remains pinned to the approved 0019 baseline. Migrations 0020–0028 remain outside the current authorized Production scope and are guarded as pending migrations.

Production remained untouched.

## Supabase / storage technical facts

Verified project region: \`us-east-1\`.

Verified organization plan at review time: Free.

Application schemas:
- \`visa_os\`
- \`visa_os_preview\`

Verified:
- Supabase roles \`anon\` and \`authenticated\` have no USAGE on the application schemas;
- bucket \`documents\` is private;
- bucket \`website-media\` is public;
- application source uses server-side PostgreSQL/Drizzle rather than browser Supabase Auth/JS for the application database;
- no Production write was used to establish these facts.

These are technical facts, not legal controller/processor or international-transfer conclusions.

## Browser storage / cookies

Inventoried first-party state:
- \`evos_session\`: opaque authentication cookie; HttpOnly; SameSite=Lax; Path=/; Secure in Production; Staff max 12 h absolute / 30 min idle; Agency max 24 h absolute / 2 h idle;
- \`evos_ui_locale\`: EN/FR/AR functional preference; SameSite=Lax; Path=/; Secure in Production; 365-day technical max age;
- \`essafaria.notification-sound\`: localStorage \`on/off\` preference only.

No application \`sessionStorage\` use was identified.

No common analytics/advertising SDK is approved or intentionally present.

No cosmetic cookie banner was added.

Hosted verification checks the deployed session cookie. The locale-cookie runtime assertion is stale-Preview aware so a Vercel-quota ancestor that predates the hardening commit is reported as SKIP rather than as a false current-HEAD regression.

## Privacy-by-default public onboarding

The public agency request deliberately collects only the minimal first-contact data needed for partnership review.

Legacy KYC/address/volume fields remain database-compatible for historical records but are not rendered or accepted by the current public action.

Administrative evidence is requested later only when Staff identifies a specific need. Follow-up links are scoped, expiring and token-hashed.

EN/FR/AR user-facing copy has been cleaned so it no longer encourages uploading company documents during first contact.

When approved Terms/Privacy versions are absent, public agency registration fails closed.

## Legal publication

The product records immutable publication evidence; it does not claim to replace external Owner/Legal approval.

A legal publication records:
- kind;
- locale;
- immutable version;
- approved effective date;
- actual publication timestamp;
- publishing SUPER_ADMIN.

Public pages use only the currently effective version.

Admin may see a newer future-effective published version without exposing it publicly before its effective date.

Legal Last Updated/effective dates never come from build/deployment timestamps.

## Legal evidence at registration

Terms acceptance and Privacy Notice acknowledgement remain distinct.

The server validates and stores the exact:
- legal version UUID;
- version number;
- effective date;
- locale.

The audit trail records distinct Terms and Privacy events.

IP/fingerprinting is not automatically added to these acceptance events.

## Governance artifacts

The repository now includes:
- \`docs/privacy/data-governance.md\`
- \`docs/privacy/data-flow-map.md\`
- \`docs/privacy/data-governance-register.md\`
- \`docs/privacy/access-need-to-know.md\`
- \`docs/privacy/browser-storage-inventory.md\`
- \`docs/privacy/vendor-inventory.md\`
- \`docs/privacy/retention-decision-register.md\`
- \`docs/privacy/privacy-request-incident-runbook.md\`
- \`docs/privacy/owner-legal-handoff.md\`
- \`docs/privacy/pilot-privacy-readiness.md\`
- \`docs/privacy/codex-verification-handoff.md\`
- this gate report.

No statutory retention duration, legal basis, notification deadline, controller/processor designation or transfer mechanism has been invented by engineering.

## Verification layers

The preprod branch has:
- TypeScript verification;
- ESLint;
- shell harness syntax checks;
- targeted Preview-build guard;
- full deterministic test suite;
- non-deploying Next.js build;
- local built-runtime Legal/Privacy smoke with embedded PostgreSQL;
- hosted Preview HTTP verification when a current or proven same-branch Preview is available;
- stale-Preview/quota classification to prevent false current-HEAD failures.

The local runtime smoke proves:
- missing approved legal content => legal pages show unpublished state;
- unpublished legal pages are noindex;
- agency registration is closed while legal content is missing;
- synthetic LOCAL-ONLY legal fixtures activate the public legal pages;
- EN/FR/AR resolve independently and Arabic is RTL;
- exact legal UUIDs appear in the form;
- first-contact KYC/address/file controls remain absent;
- a real Next.js Server Action submission succeeds with the minimized input;
- injected legacy/mass-assignment fields do not persist;
- Terms/Privacy audit evidence matches the exact accepted versions.

File-integrity regression coverage additionally proves:
- stable SHA-256;
- same-size tampering is detected;
- permanent blob mutation is database-blocked;
- document identity metadata is immutable;
- top-up request/receipt identity is immutable;
- a corrupted receipt cannot be downloaded or credited;
- a corrupted visa/registration document cannot be served or falsely audited as downloaded.

## Vercel Preview quota

Vercel has intermittently returned daily deployment/build quota errors.

The hosted workflow therefore:
1. prefers the exact current SHA;
2. if quota blocks it, may use only a proven ancestor from the same preprod branch;
3. marks that environment explicitly as STALE;
4. skips assertions introduced after the deployed ancestor instead of claiming a current-HEAD regression.

This does not authorize Production as a fallback.

## Remaining human / legal blockers

Approved legal versions in Preview remain at zero.

Engineering must not fabricate:
- Privacy Notice EN / FR / AR;
- Terms of Service EN / FR / AR;
- legal effective dates;
- legal entity/privacy contact details;
- statutory/legal retention decisions;
- rights/complaint wording;
- vendor/DPA/transfer conclusions;
- incident-notification conclusions;
- controller/processor classifications.

Owner must also decide whether V1 shared Staff operational access remains acceptable or whether a dedicated role-separation change is required.

The exact input package is \`docs/privacy/owner-legal-handoff.md\`.

## Gate verdict

Technical Legal/Privacy implementation: **PASS, subject to the authoritative branch CI staying green**

Privacy/data-governance artifacts: **PASS**

Preview database alignment through 0028: **PASS**

Private storage / tenant / function hardening evidence: **PASS**

Production isolation: **PASS**

Public tracking posture: **PASS — no approved non-essential tracking introduced**

Legal content approval: **BLOCKED ON OWNER / LEGAL INPUT**

Retention/legal-policy values: **BLOCKED ON OWNER / LEGAL INPUT**

No remaining Legal/Privacy architecture or implementation should be delegated to Codex unless an approved Owner/Legal requirement changes. Codex handoff is verification-only.
