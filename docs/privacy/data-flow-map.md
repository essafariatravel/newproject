# ESSAFARIA VISA OS — Data Flow Map

Status: technical/product map, reviewed 2026-10-03.
This map describes implemented flows. It does not assign a legal basis or vendor legal role.

## 1. Public agency request

Browser
→ `/agency/register`
→ server action `submitRegistrationAction`
→ validation / anti-abuse
→ `agency_registrations`
→ audit evidence
→ Staff registration queue.

First-contact fields are deliberately limited to agency name, primary contact, professional email, phone, optional city, accuracy confirmation and exact Terms/Privacy evidence.

Administrative/KYC documents do **not** enter this flow.

Anti-abuse uses a one-way hashed rate-limit subject in `auth_rate_limits`. The current first-contact flow does not persist the raw request IP in `agency_registrations` or in the public submission audit event.

## 2. Administrative follow-up

Authorized Staff
→ registration review
→ specific administrative evidence request
→ single-use / expiring hashed follow-up token
→ agency upload page
→ private registration document storage
→ Staff review.

Only requested administrative evidence should enter this flow.

## 3. Agency account provisioning

Authorized registration decision
→ create agency
→ create first AGENCY_ADMIN account
→ issue activation workflow
→ user chooses password
→ opaque session token returned in HttpOnly cookie
→ session hash / security metadata stored server-side.

Registration itself never grants portal access.

## 4. Visa application

Authenticated agency user
→ agency-scoped draft
→ applicant identity
→ visa/product requirements
→ private supporting documents
→ validation/checklist
→ submit
→ idempotent wallet charge
→ Staff processing
→ status / communications
→ official final decision document
→ immutable history/audit.

Tenant scope is enforced server-side. Agency users may access only their own agency records.

## 5. Documents

Browser upload
→ server validation
→ application/tenant authorization
→ generated opaque storage key
→ configured private storage provider.

Current storage abstraction:
- default: PostgreSQL `document_blobs`;
- optional: private Supabase Storage bucket `documents`, using a server-only service-role credential.

Binary document contents must not be copied into generic logs or audit metadata.

## 6. Wallet / finance

Authorized operation
→ locked agency/wallet state
→ immutable `wallet_transactions` entry
→ agency balance update
→ audit/notification.

Corrections are new compensating records. Historical ledger rows are not edited or deleted.

Top-up proof is separate private evidence and may receive a different approved retention decision from the ledger.

## 7. Communications / notifications

Authorized user
→ application-scoped communication or operational event
→ tenant-aware storage
→ recipient-scoped notification.

Agency-visible communications are filtered by application tenant and visibility. Generic logs must not duplicate private message bodies.

## 8. Legal publication

Owner/legal-approved source outside the application
→ SUPER_ADMIN publication control
→ immutable `legal_versions`
→ approved `effective_at`
→ actual system `published_at`
→ public Terms/Privacy page for matching locale.

Agency registration reads the currently effective Terms and Privacy versions and stores exact UUID/version/effective-date evidence.

The application records publication evidence; it does not fabricate external legal-review evidence.

## 9. Browser storage

Browser
→ `evos_session` cookie: authentication
→ `evos_ui_locale` cookie: language preference
→ `essafaria.notification-sound` localStorage: on/off UI preference.

No dossier/document/wallet payload is intentionally persisted in localStorage/sessionStorage.

See `browser-storage-inventory.md`.

## 10. Infrastructure boundaries

Application runtime
→ server-side PostgreSQL / Supabase project
→ optional Supabase Storage
→ Vercel runtime/build platform.

Verified Supabase project region at review time: `us-east-1`.

The application schemas `visa_os` and `visa_os_preview` are not granted schema USAGE to Supabase `anon` or `authenticated` roles.

Vendor contractual roles, transfer mechanisms and legal conclusions remain Legal Review Required.

## 11. Logs / audit / backups

Operational request
→ deliberately limited application log and/or durable audit event.

Audit evidence may contain actor, entity, action, tenant, timestamp and limited metadata. Secrets and document bodies are excluded.

Database/storage
→ provider backup/DR mechanisms.

A restored historic backup must be reconciled with later lifecycle/deletion/deactivation actions before being treated as current.

Backup retention and deletion obligations remain Owner / Legal Review Required.
