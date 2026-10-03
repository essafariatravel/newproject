# ESSAFARIA VISA OS — Data Governance Technical Register

Status: technical/product baseline.
No legal retention duration, lawful basis, controller/processor conclusion or statutory right is invented here.

## Classification

- **PUBLIC** — deliberately approved for public publication.
- **INTERNAL** — low-sensitivity operational/configuration information.
- **CONFIDENTIAL** — agency/applicant/business information limited to authorized users.
- **RESTRICTED** — documents, receipts, authentication secrets, private case communications and sensitive financial/security evidence.

Classification supplements authorization; it never replaces RBAC or tenant checks.

## Core processing activities

### Agency account management
Data: username/email as implemented, role, status, agency binding, session/security metadata.
Purpose: authenticated B2B portal access and authorization.
Lifecycle: deactivate/suspend where history references the account; deletion only under an approved rule.

### Public agency request access
New first-contact model intentionally collects:
- agency/legal name;
- country;
- city;
- optional region/wilaya;
- contact first and last name;
- contact business email;
- contact phone;
- business type;
- optional short message;
- exact Terms version accepted;
- exact Privacy Notice version acknowledged;
- submission/security metadata used by anti-abuse controls.

It intentionally does **not** collect initial KYC/company files, tax data, licence data, full postal address, monthly visa volume or main-market profiling.

Historical rows may still contain those legacy fields and documents; do not destroy them solely because the new form is minimized.

### Visa application processing
V1 applicant identity intentionally remains minimal:
- full name;
- nationality.

Additional visa-specific documents are driven by product requirements, not by privacy-policy completeness.

### Applicant/supporting documents
Private storage only.
No document body in telemetry.
Authorization required at download/access time.
Historical replacement versions follow the approved retention decision when one exists.

### Final decision documents
Private, associated with the application outcome.
Retention is an owner/legal decision, not an engineering default.

### Wallet / finance
Current ledger is immutable business/financial history.
Corrections use compensating entries.
Generic privacy deletion must never rewrite old ledger entries.

### Top-up evidence
Private receipt + financial transaction metadata are separate lifecycle categories.
A receipt can have a different approved lifecycle from the immutable ledger entry.

### Communications
Private case communications stay out of general logs/telemetry.
Lifecycle requires an approved retention decision.

### Audit / security
Durable security/business evidence may contain actor identifiers, action, entity, timestamp and limited security metadata.
Do not duplicate document bodies, passwords, tokens, receipts or private case content into audit metadata.

## Lifecycle methods

Choose deliberately per category:
- DELETE — only when safe and approved.
- DEACTIVATE — keep historical references but prevent active use.
- ANONYMIZE/PSEUDONYMIZE — only where the approved purpose can survive removal of identifying value.
- RETAIN — where an approved financial/audit/security/business/legal reason requires it.
- COMPENSATING RECORD — financial correction without rewriting immutable history.

No duration is defined in this document.

## Legal content

Public Privacy/Terms pages read only explicitly **PUBLISHED** legal versions.

A legal version records:
- document type;
- language;
- version identifier;
- content;
- workflow status;
- approved effective date;
- creation/approval/publication evidence where available;
- supersession history.

Published content is immutable in place. A change creates a new draft/version.

EN, FR and AR are independent approved artifacts. Missing/unapproved locale content is not silently substituted as approved legal text.

## Registration evidence

New public registration records preserve:
- Terms acceptance boolean/timestamp;
- Privacy acknowledgement boolean/timestamp;
- exact Terms version ID;
- exact Privacy version ID;
- distinct audit events for Terms acceptance and Privacy acknowledgement.

Marketing consent and cookie consent are not derived from these events.

## Privacy requests

Operational order:
1. receive request;
2. verify requester identity proportionately;
3. determine scope;
4. identify systems/vendors;
5. check approved retention/financial/audit conflicts;
6. obtain authorized decision;
7. execute correction/export/restriction/delete/anonymize/deactivate/retain as approved;
8. preserve action evidence without duplicating deleted sensitive payload;
9. respond/close under the approved procedure.

A public request must never trigger automatic destructive deletion.

## Backups

Live deletion does not imply immediate physical removal from encrypted historical backup generations.

If an old backup is restored, the DR procedure must reconcile privacy/lifecycle actions that occurred after the backup snapshot before restored data is considered current.

## Review triggers

Review this register whenever the platform:
- introduces a new applicant field;
- adds a new document category;
- enables analytics/advertising;
- adds or changes SMTP/monitoring/backup vendors;
- changes auth/session storage;
- changes payment processing;
- adds a public form;
- changes retention policy;
- materially changes agency/application workflows.
