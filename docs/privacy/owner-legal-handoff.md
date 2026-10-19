# ESSAFARIA VISA OS — Owner / Legal Counsel Decision Register

This file is deliberately a **decision template**. Engineering must not populate legal conclusions or invent statutory durations.

## Privacy Notice — required Owner/legal inputs

Record approved answers for:
- ESSAFARIA legal entity/controller identity and contact details;
- categories of personal data actually processed;
- purposes for each category;
- approved legal basis/justification where applicable;
- recipients/processors;
- international transfer wording/mechanism;
- approved retention criteria or durations by category;
- applicable privacy rights and request channel;
- complaint/escalation authority wording where applicable;
- security/confidentiality summary suitable for public notice;
- cookie/browser-storage disclosures that match the technical inventory;
- approved effective date;
- EN / FR / AR approved text or approved translation process.

## Terms of Service — required Owner/legal inputs

Record approved answers for:
- B2B eligibility and authority to bind an agency;
- account security/responsibility;
- service scope and limitations;
- agency responsibility for applicant information/documents;
- payment/wallet/refund/correction rules;
- visa/embassy/authority decision disclaimers;
- suspension/termination rules;
- prohibited use;
- confidentiality and document-handling obligations;
- liability limitations if approved;
- governing law/jurisdiction/dispute wording if approved;
- change/version notice process;
- approved effective date;
- EN / FR / AR approved text or approved translation process.

## Retention matrix — decision fields

For each category below, Owner/legal must provide an approved action + criterion/duration. "TBD" is intentional.

| Category | Current technical lifecycle | Approved duration / criterion |
| --- | --- | --- |
| Agency account/profile | active / suspend / authorized correction | TBD |
| Agency first-contact request | operational review history | TBD |
| Applicant identity | linked to application | TBD |
| Supporting documents | private object/blob + metadata | TBD |
| Final decision documents | linked to application outcome | TBD |
| Wallet ledger | immutable / compensating entries | TBD |
| Top-up receipts | separate private evidence | TBD |
| Communications | case operational history | TBD |
| Notifications | application operational history | TBD |
| Audit/security logs | immutable audit model | TBD |
| Sessions/security metadata | expires/revokes operationally | TBD |
| Activation/follow-up/recovery token records | single-use/expiry/revocation | TBD |
| Backups | infrastructure/DR lifecycle | TBD |

## International-transfer / vendor questions

For each external vendor actually enabled in Production, approve:
- vendor legal role;
- contractual/DPA status;
- primary region/location;
- subprocessors;
- transfer mechanism if relevant;
- security commitments relied upon;
- deletion/return obligations at contract end;
- incident-notification terms.

## Publication sign-off record

Before a Privacy Notice or Terms version is pasted into the product publication control, retain outside the application (or in an approved governance system):
- document name;
- locale;
- approved text;
- approved effective date;
- Owner approver;
- legal reviewer/approver if required;
- approval date/evidence reference.

ESSAFARIA VISA OS records immutable **publication** history. It does not fabricate external legal-review evidence.


## Operational Staff access — OWNER BUSINESS DECISION REQUIRED

Current V1 code gives ADMIN, VISA_AGENT and ACCOUNTING the same operational Staff permission perimeter, except user-account management and recovery remain SUPER_ADMIN-only.

Owner must approve either:
- keep the shared operational Staff perimeter for V1; or
- define an explicit separation of duties.

If separation is chosen, specify at minimum who may:
- view applicant/document contents;
- review documents;
- change application status;
- override submission gates;
- adjust wallets;
- view top-up receipts;
- decide agency registrations;
- manage catalogue/config/CMS;
- view audit logs and reports.

Do not delegate this choice to engineering/Codex.

## Legal-version change behavior — OWNER + LEGAL REVIEW REQUIRED

For each future Terms/Privacy update, approve the intended behavior:
- INFORMATIONAL only;
- acknowledgement requested;
- explicit re-acceptance required;
- block relevant use until re-accepted.

Also decide whether acceptance is agency-level, individual-user-level, or another model.

Engineering must not infer enforcement from textual differences between versions.

## Cookies / analytics / marketing — OWNER + LEGAL REVIEW REQUIRED

Current technical state does not intentionally include an analytics/advertising SDK.

Until a decision is approved:
- do not introduce new analytics/remarketing pixels;
- do not add a cosmetic consent banner merely to appear compliant;
- keep the technical cookie/browser-storage inventory current.

If analytics/marketing technology is proposed, approve:
- provider;
- exact purpose;
- data/events sent;
- cookie/storage keys;
- retention/configuration;
- required notice/consent behavior;
- vendor/transfer review.

## Privacy request channel / internal owner

Approve:
- official privacy request contact/channel;
- internal case owner;
- identity/authority verification approach;
- escalation path when deletion/retention obligations conflict;
- external counsel/contact if applicable.

Do not publish a response deadline or statutory right unless legally reviewed for the applicable jurisdiction and relationship.
