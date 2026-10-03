# ESSAFARIA VISA OS — Pilot Privacy Readiness Matrix

Status: release-readiness matrix.
Authoritative branch: \`preprod/essafaria-final-hardening\`.
Date: 2026-10-03.

Legend:
- **PASS** — technical/product requirement implemented and verified.
- **OWNER DECISION** — implementation must not guess the business policy.
- **LEGAL REVIEW REQUIRED** — jurisdiction/contract/legal interpretation required.
- **EXTERNAL CONFIG** — vendor/account/contract configuration must be verified outside source code.
- **NOT ENABLED** — deliberately absent because enabling it without an approved requirement would increase privacy risk.

| Ref | Requirement | Status | Evidence / release meaning |
| --- | --- | --- | --- |
| A | Data inventory | PASS | \`data-governance.md\` + \`data-governance-register.md\` |
| B | Data-flow map | PASS | \`data-flow-map.md\` |
| C | Data minimization | PASS | First-contact agency form whitelisted/minimized; raw request IP is not persisted in the business row/public submission audit; anti-abuse state is hashed; local + hosted regression coverage |
| D | Data classification | PASS | PUBLIC / INTERNAL / CONFIDENTIAL / RESTRICTED baseline documented |
| E | Access / need-to-know | PASS technically + OWNER DECISION | Current effective role perimeter documented in \`access-need-to-know.md\`; separation-of-duties choice remains Owner decision |
| F | Privacy Notice input package | PASS as decision template | \`owner-legal-handoff.md\`; actual approved EN/FR/AR content remains blocked on Owner/Legal |
| G | Terms input package | PASS as decision template | \`owner-legal-handoff.md\`; actual approved EN/FR/AR content remains blocked on Owner/Legal |
| H | Legal content versioning | PASS | Immutable \`legal_versions\`, locale-specific versions, effective vs published timestamps |
| I | Acceptance / acknowledgement evidence | PASS | Exact Terms + Privacy UUID/version/effective-date evidence; separate audit events |
| J | Legal version change behavior | OWNER DECISION + LEGAL REVIEW REQUIRED | Informational / acknowledgement / re-acceptance / block-until-accepted must be explicitly selected |
| K | Retention framework | PASS framework + LEGAL REVIEW REQUIRED | \`retention-decision-register.md\`; no fabricated duration |
| L | Delete / deactivate / anonymize / retain / compensate model | PASS framework | Category-specific lifecycle model documented; immutable finance/legal/audit protected |
| M | Privacy request workflow | PASS operational runbook + LEGAL REVIEW REQUIRED | \`privacy-request-incident-runbook.md\`; no invented statutory deadline |
| N | Privacy export | NOT ENABLED by default | Runbook defines safe scoped export controls if an approved request requires export; no broad “download everything” endpoint is introduced |
| O | Backups / deletion reconciliation | PASS runbook + EXTERNAL CONFIG | Post-restore reconciliation documented; vendor backup-retention configuration remains external |
| P | Logs / monitoring privacy | PASS | Raw public auth/storage errors redacted; sensitive payloads plus redundant filenames/identity fields are excluded from targeted durable audits; code-only diagnostics regression guards |
| Q | Cookie / browser-storage inventory | PASS | Full inventory + deployed session-cookie check + locale-cookie runtime gate |
| R | Cookie consent decision tree | PASS technical framework + LEGAL REVIEW REQUIRED | No non-essential analytics SDK detected; future tracking requires review before enablement |
| S | Cookie banner | NOT ENABLED | Correctly absent while no reviewed non-essential tracking requires it; never add cosmetic banner |
| T | Cookie Policy | LEGAL REVIEW REQUIRED if public legal text is required | Technical inventory is complete; engineering must not fabricate legal notice text |
| U | Analytics / UTM | PASS | No common analytics/advertising SDK; sensitive data prohibited in campaign parameters |
| V | Public forms | PASS | Agency first-contact is minimized; no initial KYC/document upload; raw request IP is used only transiently for hashed anti-abuse; legal gate fails closed |
| W | Email / SMTP privacy | NOT ENABLED + EXTERNAL CONFIG if added | No transactional SMTP provider found; future provider must enter vendor/data-flow inventory |
| X | Public legal pages | PASS technically / content blocked | \`/privacy\` + \`/terms\` serve only approved effective content, no silent locale fallback, noindex when unavailable |
| Y | Legal approval workflow | PASS product boundary | External Owner/Legal approval remains external; SUPER_ADMIN publication records immutable publication evidence only |
| Z | Admin UI | PASS | Controlled legal publication interface; latest scheduled version visible separately from currently effective public version |
| AA | Privacy incidents | PASS runbook + LEGAL REVIEW REQUIRED | Containment/scope/remediation/evidence workflow documented; legal notification decision remains external |
| AB | Third-party/vendor inventory | PASS technical inventory | \`vendor-inventory.md\`; contracts/DPA/subprocessors remain external review |
| AC | Data location / transfer questions | PASS technical facts + LEGAL REVIEW REQUIRED | Supabase project region and app boundaries recorded; legal transfer conclusions not invented |
| AD | Privacy-by-design QA | PASS | Deterministic tests, local built-runtime HTTP/DB smoke and hosted Preview verification |
| AE | P0 / P1 / P2 severity | PASS | Severity rules below |
| AF | Owner / legal blocker package | PASS | \`owner-legal-handoff.md\` |
| AG | Governance register | PASS | \`data-governance-register.md\` |
| AH | Pilot privacy readiness | **BLOCKED ONLY ON HUMAN/LEGAL INPUTS** | Technical gate passes; approved legal content + policy decisions remain |
| AI | Low-Codex-token strategy | PASS | Repo now contains implementation, tests, runbooks and evidence; no architecture reconstruction required |
| AJ | Final verification report | PASS | \`LEGAL_PRIVACY_GATE_REPORT_2026-10-03.md\` |
| AK | Future Codex handoff | PASS / verification-only | \`codex-verification-handoff.md\`; no Legal/Privacy implementation should be delegated unless approved requirements change |

## Severity model

### P0 — release blocker

Examples:
- unapproved/fabricated Privacy or Terms content exposed as approved;
- legal version can be mutated/deleted after publication;
- registration accepts a stale/tampered legal version;
- private document/tenant data exposed cross-tenant or publicly;
- public form begins collecting unnecessary KYC/document data without review;
- unapproved analytics/advertising tracker introduced;
- secrets/document bodies/receipts/passwords/tokens reach public logs;
- Production migration/deployment occurs outside the authorized release process;
- legal gate silently falls back to another language.

### P1 — must fix before broad rollout unless explicitly accepted

Examples:
- incomplete governance/vendor/storage inventory for an actually enabled feature;
- cookie/storage attributes diverge from documented behavior;
- operational Staff access is broader than the Owner-approved model;
- privacy-request/incident procedure lacks an accountable owner after policy approval;
- hosted validation cannot exercise an enabled privacy-critical path.

### P2 — non-blocking polish

Examples:
- wording consistency that does not change data collection or legal meaning;
- governance-document formatting;
- additional evidence links/automation convenience.

## Pilot go/no-go

Technical engineering status: **GO**.

Pilot launch status: **NO-GO until Owner/Legal supplies the required approved legal content and policy decisions.**

Required human inputs before opening public agency onboarding:
1. approved Privacy Notice EN / FR / AR;
2. approved Terms of Service EN / FR / AR;
3. approved effective dates;
4. approved legal entity/privacy contact details;
5. retention decisions for the categories needed for pilot;
6. approved privacy-request channel/internal owner;
7. Owner decision on V1 Staff role separation;
8. applicable vendor/DPA/transfer conclusions;
9. legal-update enforcement mode where relevant.

The product is intentionally designed to fail closed while the legal versions are absent.
