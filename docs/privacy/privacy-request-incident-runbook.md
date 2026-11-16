# ESSAFARIA VISA OS — Privacy Request & Privacy Incident Runbook

Status: operational engineering runbook.
No statutory deadline, mandatory notification threshold or legal right is asserted here. Legal Review Required for jurisdiction-specific obligations.

## A. Privacy/data request

### Intake

Create an internal case/reference outside public destructive endpoints.

Record only what is necessary:
- requester identity/contact;
- claimed relationship (agency user, agency representative, applicant, other);
- request type as stated by requester;
- relevant agency/application references if supplied;
- received timestamp;
- assigned internal owner.

Do not request passport/document copies by default merely to open the case.

### Identity / authority verification

Use a proportionate method approved by Owner/legal.

For agency-account requests, prefer authenticated/account/business-channel evidence where appropriate.

For applicant requests received through an agency relationship, determine authority/representation before disclosing anything.

### Scope discovery

Search applicable systems/categories:
- agency registration/profile/users;
- sessions/security records;
- applications/applicants;
- documents and document blobs/storage;
- communications/notifications;
- wallet/top-up/financial evidence;
- audit records;
- legal acceptance evidence;
- configured external vendors/backups where applicable.

Tenant boundaries still apply during investigation.

### Decision

Classify each requested category separately:
- CORRECT
- EXPORT/DISCLOSE
- RESTRICT
- DEACTIVATE
- DELETE
- ANONYMIZE/PSEUDONYMIZE
- RETAIN
- COMPENSATE (financial correction only).

Check the approved retention register before executing.

When the register is TBD or obligations conflict, stop and escalate to Owner/legal; do not improvise a destructive action.

### Execution controls

For any destructive change:
1. identify exact rows/objects first;
2. capture IDs/counts, not full sensitive payload, in the work record;
3. perform tenant-safe targeted action;
4. preserve immutable finance/audit constraints;
5. revoke access where deactivation/account closure is part of the decision;
6. handle external/private storage objects consistently;
7. record completion evidence without re-copying the deleted payload;
8. add the action to the post-restore reconciliation list if backups can reintroduce it.

### Export controls

If an export is approved:
- export only the authorized scope;
- exclude other tenants and unrelated Staff/security data;
- treat the generated export as RESTRICTED;
- use a short-lived/private delivery channel;
- audit creation/delivery;
- delete the temporary export under the approved temporary-artifact rule.

Whether a specific export is legally required is Legal Review Required.

## B. Privacy/security incident

Examples of triggers:
- document served to the wrong agency/user;
- cross-tenant query/result;
- exposed private Storage object;
- sensitive data in public logs/URLs/browser storage;
- lost/stolen credential or token exposure;
- unintended public/indexable private page;
- bulk export sent to wrong recipient;
- backup/restore revives data/access that should remain removed/revoked.

### Immediate technical containment

1. preserve minimal incident evidence;
2. revoke affected sessions/tokens/links;
3. disable the exposed route/object/access path if needed;
4. stop further propagation/logging;
5. identify affected environment (Preview vs Production);
6. do not destructively erase evidence needed for investigation.

### Scope

Determine:
- exact time window;
- data categories involved;
- tenants/applicants/users affected;
- whether content was merely reachable or actually accessed where evidence exists;
- systems/vendors involved;
- whether secrets/credentials require rotation;
- whether backups/caches/search indexes are implicated.

Do not speculate beyond evidence.

### Remediation

- close authorization/tenant defect;
- rotate/revoke credentials/tokens if needed;
- remove public exposure;
- correct logs/telemetry configuration;
- add regression test;
- verify no equivalent path remains;
- document residual risk.

### Legal/management escalation

Owner and appropriate legal/privacy/security professionals decide:
- legal classification of the incident;
- notification obligations;
- affected-person/regulator/vendor communications;
- deadlines;
- required preservation.

Engineering must not invent those conclusions.

### Closure evidence

Record:
- incident reference;
- factual timeline;
- affected systems/categories/counts where established;
- containment actions;
- remediation commit/test;
- verification result;
- Owner/legal decisions/references;
- follow-up actions.

Avoid attaching unnecessary raw personal data to the incident ticket.

## C. Backup restore reconciliation

After any restore:
- reapply post-snapshot account suspensions/revocations;
- reapply approved deletions/anonymizations;
- confirm legal-content active versions;
- invalidate obsolete sessions/recovery/follow-up links;
- reconcile financial ledger only through existing immutable records;
- verify privacy-request/incident corrective actions that occurred after the snapshot.

The restored system is not considered current until reconciliation completes.
