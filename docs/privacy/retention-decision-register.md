# ESSAFARIA VISA OS — Retention Decision Register

Status: decision-ready technical register.
No legal/statutory duration is supplied by engineering.

Use this document to record an approved retention rule before implementing destructive automation.

| Data category | Lifecycle trigger | Current technical behavior / constraint | Candidate lifecycle action | Approved duration / criterion | Decision source |
| --- | --- | --- | --- | --- | --- |
| Agency first-contact request | submitted / decided | retained with decision/history | RETAIN / DELETE / ANONYMIZE after approved rule | TBD | OWNER + LEGAL REVIEW |
| Legacy registration KYC fields | historical records | nullable; new public intake no longer collects them | RETAIN / ANONYMIZE / DELETE if safe | TBD | OWNER + LEGAL REVIEW |
| Registration admin documents | requested / received / decision complete | private, linked to registration | RETAIN / DELETE per approved rule | TBD | OWNER + LEGAL REVIEW |
| Agency profile | active / suspended / closed | referenced by users/apps/finance | DEACTIVATE; selective correction/anonymization if approved | TBD | OWNER + LEGAL REVIEW |
| User account | active / suspended / departed | historical actor references may remain | DEACTIVATE + revoke access; deletion/anonymization only if approved | TBD | OWNER + LEGAL REVIEW |
| Sessions | created / expired / revoked | operational expiry/revocation | DELETE expired rows under approved operational rule | TBD | OWNER / SECURITY + LEGAL REVIEW as needed |
| Activation/recovery/follow-up tokens | issued / expired / used / revoked | hashes/evidence, single-use controls | DELETE/RETAIN minimal evidence per approved rule | TBD | OWNER / SECURITY |
| Applicant identity | application lifecycle | application-linked | RETAIN / ANONYMIZE / DELETE if dependencies permit | TBD | OWNER + LEGAL REVIEW |
| Supporting documents | upload / replacement / case close | private versions; referenced by checklist/requests | RETAIN / DELETE versions per approved rule | TBD | OWNER + LEGAL REVIEW |
| Official final decision document | final outcome | required case evidence | RETAIN / DELETE only under approved rule | TBD | OWNER + LEGAL REVIEW |
| Application record/status history | draft / submitted / closed | operational history | RETAIN / ANONYMIZE selectively if approved | TBD | OWNER + LEGAL REVIEW |
| Communications | message / case close | private case history | RETAIN / DELETE per approved rule | TBD | OWNER + LEGAL REVIEW |
| Notifications | created / read | user operational history | DELETE after approved criterion | TBD | OWNER |
| Wallet ledger | financial transaction | immutable; UPDATE/DELETE blocked | RETAIN; correction only by compensating entry | TBD | OWNER + ACCOUNTING + LEGAL REVIEW |
| Price adjustments | financial adjustment | immutable history | RETAIN; compensate, never rewrite | TBD | OWNER + ACCOUNTING + LEGAL REVIEW |
| Top-up request metadata | requested / decided | finance workflow | RETAIN / lifecycle per approved rule | TBD | OWNER + ACCOUNTING + LEGAL REVIEW |
| Top-up receipt/proof | uploaded / decided | private evidence separate from ledger | RETAIN / DELETE independently from ledger | TBD | OWNER + ACCOUNTING + LEGAL REVIEW |
| Audit log | event time | durable/immutable evidence | RETAIN / pseudonymize only under explicit approved design | TBD | OWNER + SECURITY + LEGAL REVIEW |
| Registration/security IP metadata | request/event | anti-abuse/security evidence | RETAIN / truncate/anonymize/delete after approved criterion | TBD | OWNER + SECURITY + LEGAL REVIEW |
| Legal versions | published / superseded | immutable publication history | RETAIN | TBD | OWNER + LEGAL REVIEW |
| Legal acceptance evidence | acceptance time | registration + audit evidence | RETAIN with applicable relationship/evidence rule | TBD | OWNER + LEGAL REVIEW |
| Backups | snapshot time | provider/DR lifecycle | expire generations under approved backup policy; reconcile deletions after restore | TBD | OWNER + DR + LEGAL REVIEW |

## Decision rules

For each row, an approved decision must state:
- exact data category/scope;
- lifecycle trigger;
- duration or objective criterion;
- action: DELETE / DEACTIVATE / ANONYMIZE/PSEUDONYMIZE / RETAIN / COMPENSATE;
- exception/hold conditions if any;
- backup treatment;
- responsible owner;
- authority/source for the decision;
- review date.

## Engineering constraints

Do not build one generic "delete customer" cascade.

Do not rewrite wallet/financial history.

Do not delete security/audit evidence solely because a profile is deactivated without an approved rule.

Do not claim that deletion from live tables immediately erases historical backup generations.

Do not automate a TBD row.

A future retention job must be dry-run/reportable first, tenant-safe, idempotent, audited and tested against backup/restore reconciliation.
