# ESSAFARIA VISA OS — Privacy & Data Governance Technical Baseline

Status: engineering baseline for the Legal / Privacy readiness gate.
Date of technical review: 2026-10-03.

This document records the current product architecture and implementation choices. It does **not** invent a legal basis, statutory retention period, controller/processor conclusion, consent requirement, or jurisdictional obligation. Those decisions remain Owner / legal-counsel inputs.

## Data classes

| Class | Examples | Default handling |
| --- | --- | --- |
| PUBLIC | approved marketing pages, approved legal pages, public visa catalogue | Public only when deliberately published |
| INTERNAL | non-sensitive operational configuration, internal workflow labels | Authenticated staff as appropriate |
| CONFIDENTIAL | agency account data, applicant identity, application metadata, communications | Authorized tenant/staff access only |
| RESTRICTED | passport/supporting documents, decision documents, receipts, authentication secrets, security evidence | Strict authorization, private storage, no payload logging |

Classification supplements RBAC/tenant authorization; it does not replace it.

## Agency account data

Purpose in product architecture: provision and operate a B2B agency workspace, authenticate authorized users, maintain billing/contact details, and preserve operational history.

Lifecycle methods supported by the architecture:
- deactivate/suspend accounts where history must remain;
- revoke sessions/access independently of business-history deletion;
- correct profile/contact fields through authorized workflows;
- retain immutable linked financial/audit history where an approved rule requires it.

No retention duration is defined here.

## Public agency request access

The first-contact form is intentionally minimized. New submissions collect:
- agency/legal name;
- primary contact name;
- professional shared agency email;
- phone / WhatsApp;
- optional city;
- explicit Terms acceptance;
- explicit Privacy Notice acknowledgement;
- accuracy confirmation;
- exact legal version identifiers, numbers, locale and effective dates;
- anti-abuse rate-limit state keyed by a one-way hash of the request source; the raw IP is not persisted in the partnership record or its public submission audit.

The first-contact form intentionally does **not** request:
- commercial registration;
- tax identifier;
- agency licence;
- monthly visa volume;
- main-market profiling;
- full postal address;
- administrative/KYC document uploads.

Specific administrative documents can be requested later by authorized Staff through the existing scoped, expiring, hashed follow-up-link workflow.

Historical registration rows may contain legacy fields. They are not deleted merely because the current first-contact model is smaller.

## Applicant data

Current V1 operational model requires only the minimum identity fields needed by the current request flow (notably full name and nationality). Legacy applicant columns remain nullable for historical compatibility.

Additional applicant data must be introduced only when justified by a concrete visa/product requirement.

## Application/supporting documents

Documents are private operational data. The storage abstraction supports:
- PostgreSQL bytea storage (current default when `STORAGE_PROVIDER=db`);
- optional private Supabase Storage through a server-only service-role credential.

Security expectations:
- no public document URL;
- authorization checked at the application/tenant layer before access;
- opaque generated storage keys;
- no document body in audit metadata or logs;
- no redundant original filename in durable upload/download audit metadata when the document entity ID already identifies the record;
- private download `Content-Type` comes from validated, immutable database metadata rather than storage-provider response metadata;
- replacement/history follows an approved lifecycle decision rather than an automatic destructive rule.

## Final decision documents

Approval/refusal documents are application records and may have a different lifecycle from ordinary supporting uploads. Their retention rule is an Owner/legal decision.

## Wallet / financial history

The wallet is an immutable ledger model. Historical financial entries are not rewritten by generic privacy deletion logic. Corrections use compensating entries.

Receipts/evidence and ledger rows are separate categories and can receive different approved lifecycle rules.

## Communications and notifications

Case communications and notification records are operational data. Message bodies must not be copied into generic telemetry. Retention remains an explicit policy decision.

## Audit and security records

Audit logs are immutable history in the current hardening model. They may include actor identifiers, action, entity, timestamp, tenant context and deliberately limited metadata.

Never put into audit metadata:
- passwords or password hashes;
- session/activation/follow-up tokens;
- full document contents;
- receipt/document binary contents;
- unnecessary applicant sensitive values;
- redundant document/receipt filenames, agency legal names, user emails or usernames when the audited entity IDs already provide the required traceability.

Privacy deletion/anonymization decisions for audit evidence must preserve security/accountability needs defined by the approved policy.

## Legal content and acceptance evidence

Published legal content is stored in immutable `legal_versions` history.

Each published version records:
- UUID;
- kind (`terms` or `privacy`);
- locale (EN / FR / AR);
- monotonically increasing version number;
- approved text;
- approved effective date;
- actual publication timestamp;
- publishing SUPER_ADMIN.

The public Terms/Privacy pages show only the version currently effective for the selected locale. Future-dated published versions do not become active early.

Agency registration verifies both the version number and exact UUID that were displayed. The registration record stores that evidence and audit history records Terms acceptance and Privacy acknowledgement as separate events.

Cookie/analytics/marketing consent is not derived from Terms acceptance or Privacy acknowledgement.

## Privacy-request operational sequence

A privacy request should be processed through this sequence once the Owner/legal process is approved:

1. Receive and classify the request.
2. Verify requester identity proportionately.
3. Determine scope (account, applicant, documents, communications, finance, audit, vendors).
4. Identify retention/legal/security conflicts.
5. Obtain the authorized decision.
6. Execute the approved action: correct, export, restrict, deactivate, anonymize, delete, or retain.
7. Preserve minimal evidence that the action was completed without re-copying deleted sensitive payload.
8. Complete vendor follow-up where applicable.
9. Close/respond under the approved procedure.

A public request must never trigger automatic destructive deletion.

## Backups and disaster recovery

Live deletion does not imply immediate physical removal from encrypted historical backup generations.

If an older backup is restored, the recovery procedure must reconcile privacy/lifecycle actions that occurred after the restored snapshot before the restored data is treated as current.

No backup-retention duration is defined here.

## Review triggers

Re-run this governance review when a release:
- introduces new applicant/profile fields;
- adds a public form;
- adds a new document/receipt category;
- changes payment processing;
- enables analytics, advertising or third-party embeds;
- changes authentication/session storage;
- adds a new infrastructure/vendor processor;
- changes backup strategy;
- changes an approved retention rule.
