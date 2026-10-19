# ESSAFARIA VISA OS — Disaster Recovery & Operational Runbook

Status: implementation support document for the pre-production DR gate.

This document intentionally contains no passwords, tokens, private applicant data, backup locations, or recovery keys.

## 1. Recovery contract

A backup is not accepted because an archive exists. A recovery generation is accepted only when:

1. the source environment, project, schema and release are identified;
2. the database archive and storage inventory are encrypted;
3. cryptographic checksums are recorded and verified;
4. the archive can be parsed and restored;
5. the restored schema and critical business tables are present;
6. wallet history reconciles to current balances;
7. database document metadata reconciles with stored objects;
8. critical decision and top-up evidence is present;
9. tenant-isolation/application checks pass against the isolated restore;
10. an independent/off-site copy is verified.

The machine-readable implementation is in `scripts/lib/dr-safety.ts`.

## 2. Environment identities

Production:

- Supabase project: `xgetzgixalrsmuvfthpf`
- database schema: `visa_os`
- application host: `visa.essafariavoyages.com`

Preview:

- same approved Supabase project
- database schema: `visa_os_preview`

Restore tests:

- must set `DR_ENVIRONMENT=RESTORE_TEST`;
- must use a local disposable database or an explicitly named disposable Supabase project;
- may never target the Production Supabase project;
- may never execute in a Vercel/Production runtime.

`npm run dr:restore-verify` refuses an ambiguous or Production target before opening a database connection.

Current provider constraint: the connected Supabase organization reported the **Free** plan on 2026-10-03. Current Supabase documentation does not give Free projects the managed daily-backup/PITR assumptions used by paid recovery tiers; ESSAFARIA therefore relies on the guarded encrypted export + independent off-site copy until that service level is changed and re-verified. See `dr-executable-procedure.md` and the dated read-only evidence report.

## 3. Existing controls reused

The DR gate reuses existing safeguards instead of replacing them.

- wallet mutation is transactional and ledger-backed;
- wallet history is database-immutable;
- application submission is idempotent;
- top-up processing is locked and idempotent;
- official final decisions require persisted evidence in the hardened schema;
- go-live reset tooling is read-only and refuses Production;
- Production release tooling pins the project/schema and fails closed on drift;
- release tooling already differentiates application rollback from database changes;
- Preview/Production use separate schemas;
- protected branches forbid automatic migration/seed work during Vercel builds.

The DR branch adds verification and recovery evidence around those controls.

## 4. Storage model

The application supports two storage modes.

### DATABASE_BLOBS

Default mode. Private object bytes are held in the `document_blobs` table and therefore travel with a complete logical/physical database recovery copy.

The restore verifier reconciles blob inventory against:

- dossier documents;
- official final-decision documents;
- agency-registration documents;
- top-up receipts;
- current agency logos;
- current platform logo.

A database backup is still not considered independently protected until an encrypted off-site archive is verified.

### EXTERNAL_OBJECTS

When `STORAGE_PROVIDER=supabase`, object bytes live outside the application schema.

Database recovery alone is insufficient.

The restore verifier requires an explicit external object inventory:

```json
{
  "objects": [
    {
      "key": "opaque/object/key",
      "sizeBytes": 12345,
      "sha256": "optional-64-character-sha256"
    }
  ]
}
```

The verifier never fabricates missing objects.

## 5. Backup states

### INVALID

Examples:

- wrong project or schema;
- malformed manifest;
- unencrypted database/storage;
- invalid checksum format;
- source identity does not match the intended environment.

An INVALID backup cannot be used for reset/recovery authorization.

### CREATED

The backup may exist and be structurally described, but one or more recovery proofs are incomplete.

Typical examples:

- no isolated restore yet;
- no wallet reconciliation;
- no storage reconciliation;
- no tenant-isolation proof;
- no off-site copy proof.

CREATED is **not** enough for a destructive go-live operation.

### VERIFIED

All mandatory integrity, restore, wallet, storage, isolation and off-site checks are recorded and pass. A VERIFIED manifest must also bind those claims to traceable evidence: the SHA-256 of the automatically generated restore evidence plus opaque references for the reviewed off-site, application-recovery and tenant-isolation evidence.

Use `npm run dr:finalize`; do not hand-edit verification booleans.

Only VERIFIED satisfies the DR backup prerequisite.

## 6. Manifest verification

Run offline:

```bash
npm run dr:manifest -- --manifest /secure/path/backup-manifest.json --source production
```

The command:

- does not contact Production;
- does not print archive contents;
- does not print credentials;
- exits 0 only for VERIFIED;
- exits non-zero for CREATED or INVALID.

The example manifest is `docs/operations/dr-backup-manifest.example.json`.

## 7. Restore verification

After an operator has restored a backup into a disposable database:

```bash
DR_ENVIRONMENT=RESTORE_TEST \
DATABASE_SCHEMA=visa_os_restore_test \
DATABASE_URL='<safe-local-disposable-database-url>' \
npm run dr:restore-verify
```

For explicitly approved remote disposable Supabase targets:

- set `DR_ALLOW_REMOTE_DISPOSABLE=true`;
- set `DR_DISPOSABLE_PROJECT_REF`;
- the database URL must match that project;
- the project ref must not be the ESSAFARIA Production ref.

The verifier starts a `READ ONLY` transaction and checks:

- critical tables;
- migration ledger;
- wallet reference sequence;
- agency balances;
- wallet ledger arithmetic;
- wallet ledger continuity;
- current balance versus ledger tail;
- duplicate application charges;
- top-up-to-ledger consistency;
- document/storage references;
- missing official-decision evidence;
- missing top-up receipt evidence;
- size/version mismatches;
- orphan objects.

No record is updated, deleted, replayed or repaired.

## 8. Financial recovery rule

Restoring a database to time T0 must never silently erase or replay legitimate financial operations after T0.

If a recovery point predates valid wallet activity:

1. freeze submissions and wallet mutations;
2. preserve the damaged/current evidence before changing anything;
3. establish the selected restore point;
4. collect ledger, audit, top-up, application and request evidence after T0;
5. classify each post-T0 financial event:
   - CONFIRMED_COMMITTED;
   - CONFIRMED_NOT_COMMITTED;
   - AMBIGUOUS;
6. never replay CONFIRMED_NOT_COMMITTED;
7. never guess AMBIGUOUS events;
8. replay only evidence-backed committed events through a separately reviewed idempotent recovery procedure using original business references;
9. run wallet reconciliation again;
10. require business-side approval before reopening financial writes.

The original immutable ledger must never be edited to make totals fit.

## 9. Database/storage reconciliation states

Operational classifications:

- **HEALTHY** — metadata and expected object agree.
- **MISSING_BLOB** — metadata exists, object does not.
- **CRITICAL_DOCUMENT_MISSING** — official decision or top-up receipt is missing.
- **ORPHAN_BLOB** — object exists without a recognized live/historical reference.
- **ORPHAN_METADATA** — metadata cannot resolve its stored object.
- **VERSION_OR_SIZE_MISMATCH** — metadata and stored object differ.
- **REVIEW_REQUIRED** — evidence is insufficient for an automatic conclusion.

Missing files are never reconstructed or silently marked healthy.

## 10. Initial recovery objectives

These are operational targets, not contractual SLAs.

| Incident | Initial RPO target | Initial operational recovery target |
| --- | --- | --- |
| Bad application deployment, DB intact | zero business-data loss | 30–60 min |
| General app outage, DB intact | near-zero | 2–4 h |
| Database corruption with PITR available | <=15 min target | 2–4 h |
| Database corruption without PITR | latest VERIFIED backup | 4–8 h |
| Storage/object loss | <=24 h initially | <=8 h |
| Configuration deletion | <=24 h | <=2 h |
| One-agency incident | avoid valid transaction loss | 2–4 h containment |
| Wallet integrity incident | evidence-driven, not an arbitrary RPO | freeze quickly; reconcile before reopening |

## 11. Backup cadence

Initial small-team operating target:

- automated database protection at least daily;
- independent encrypted logical copy at least daily;
- private-object backup/inventory at least daily;
- fresh manual backup before approved reset;
- fresh manual backup before recovery-sensitive Production migration;
- verify off-site copy after creation.

Suggested technical generations:

- 14 daily;
- 8 weekly;
- 6 monthly;
- special pre-reset/pre-migration copies retained until the relevant change is formally stable.

These are technical recommendations, not legal-retention conclusions.

## 12. Off-site minimum

At least one recovery copy must not depend entirely on the same Supabase project/account.

Minimum controls:

- organization-controlled destination;
- encryption at rest and in transit;
- separate access path/credentials from the primary service;
- MFA;
- least privilege;
- access logging where available;
- no public object or shared public link;
- no applicant identity in archive filenames;
- checksum comparison after copy;
- documented owner/technical access.

Do not add multi-cloud complexity until one independent restore path is proven.

## 13. Maintenance modes

Prefer targeted containment rather than one universal "site off" switch.

Required operational concepts before pilot:

- NORMAL;
- AGENCY_READ_ONLY;
- SUBMISSION_FREEZE;
- FINANCIAL_FREEZE;
- STAFF_INVESTIGATION.

Global maintenance is appropriate only when the whole application must be withdrawn.

A wallet incident should normally block financial/submission writes while retaining authorized Staff read access for investigation.

## 14. Responsibility matrix

| Operation | Staff | SUPER_ADMIN / Operations | Technical operator | Owner |
| --- | --- | --- | --- | --- |
| Acknowledge incident | yes | yes | yes | optional |
| Investigate dossier | yes | yes | support | optional |
| Suspend individual user | authorized only | yes | support | oversight |
| Suspend agency | no | yes | support | major-case approval |
| Freeze submissions | no | yes | support | informed |
| Freeze wallet writes | no | yes | support | approval for prolonged freeze |
| Normal top-up decision | authorized role | yes | no | policy only |
| Edit/delete historical ledger | never | never | never | never |
| Access backup archive | no | restricted | yes | recovery access |
| Run isolated restore | no | observe | yes | optional |
| Restore Production | no | co-authorize | execute | authorize |
| Rotate critical credentials | no | coordinate | execute | authorize |
| Production reset | no | review | execute | authorize |
| Production deployment | no | review | execute | release policy |

Dual approval is recommended for Production restore, Production reset, destructive cleanup and financial reconciliation after a rollback.

## 15. Incident evidence package

For SEV-1 and material SEV-2 incidents preserve:

- incident ID;
- detection and containment timestamps;
- environment;
- release SHA/deployment identifier;
- correlation/request IDs;
- affected internal resource IDs;
- relevant audit/log events;
- wallet/top-up/application references;
- backup generation IDs;
- selected restore point;
- operator identity;
- actions taken;
- approvals;
- verification results;
- closure time.

Do not copy passwords, access tokens, database URIs or unnecessary applicant data into the incident report.

## 16. Severity

### SEV-1

Immediate integrity/security risk, for example:

- cross-tenant exposure;
- compromised SUPER_ADMIN;
- wallet corruption;
- duplicate financial mutation confirmed;
- significant private-document exposure;
- destructive Production event.

### SEV-2

Major availability/workflow incident:

- Production unavailable;
- database/Auth/Storage provider outage;
- deployment regression;
- broad login failure.

### SEV-3

Localized incident:

- one user login issue;
- one dossier document issue;
- one-agency operational inconsistency without wider evidence.

### SEV-4

Minor non-critical defect.

## 17. Standard runbook

Every incident uses this sequence:

1. trigger/symptom;
2. severity;
3. first checks;
4. immediate containment;
5. actions explicitly forbidden;
6. evidence to preserve;
7. recovery;
8. post-recovery validation;
9. operational communication;
10. technical escalation;
11. closure criteria;
12. follow-up/root-cause action.

## 18. Runbook — Production unavailable

**Trigger:** broad application outage/error rate.

**Severity:** SEV-2; SEV-1 if data/security damage is suspected.

**First checks:** application health, Vercel status/deployment, Supabase service status, last release/config change.

**Contain:** stop releases. If partial writes behave unpredictably, freeze mutation workflows.

**Never:** restore the database solely because the web app is unavailable.

**Evidence:** timestamps, release SHA, error/correlation IDs, provider incident evidence.

**Recover:** distinguish application hosting, database, Auth and Storage failures. Roll back the application only when the current database remains compatible.

**Validate:** login, application read, document read, wallet read, submission only when safe.

**Close:** service stable and critical smoke checks pass.

## 19. Runbook — database unavailable

**Trigger:** widespread DB connection/time-out errors.

**Severity:** SEV-2.

**Contain:** stop risky retries/releases.

**Never:** restore a healthy database to solve a connectivity outage.

**Evidence:** connection-error class, provider status, recent env/config/migration changes.

**Recover:** restore connectivity/service first. Enter data-recovery procedure only if evidence shows corruption/loss.

**Validate:** schema/ledger, critical reads, wallet reconciliation around incident boundary.

## 20. Runbook — Vercel outage / application regression

**Trigger:** app unavailable while database/provider remains healthy, or failure begins after release.

**Contain:** stop additional releases.

**Never:** treat an application rollback as a database rollback.

**Recover:** if DB is backward-compatible, re-point/rollback to a known healthy application deployment. If a migration is incompatible, freeze writes and choose forward-fix versus database recovery deliberately.

**Close:** known-good release serves traffic and smoke tests pass.

## 21. Runbook — Supabase outage

**Trigger:** DB/Auth/Storage functions fail across the product.

**Contain:** block business actions whose commit state cannot be proven.

**Never:** manually credit wallets because a request "probably failed".

**Evidence:** provider incident time, request/correlation IDs, affected operations.

**Recover:** wait for component recovery; reconcile submissions/top-ups/wallet events spanning the outage.

**Close:** service restored and ambiguous financial operations resolved.

## 22. Runbook — private Storage unavailable

**Trigger:** database works but file retrieval/upload fails.

**Contain:** stop final decisions that require unavailable evidence.

**Differentiate:** authorization failure, expired access mechanism, provider outage, missing metadata, missing object, version mismatch.

**Never:** create a replacement and call it the original.

**Recover:** restore exact evidence-backed object/version when available.

**Close:** database/storage reconciliation passes for affected scope.

## 23. Runbook — agency says wallet is wrong

**Severity:** start SEV-3; promote to SEV-1 for real inconsistency or multiple affected agencies.

Check:

1. agency identity;
2. current balance;
3. ordered ledger;
4. disputed reference/amount;
5. related application or top-up;
6. before/after balances;
7. audit evidence.

Classify as:

- expected debit;
- duplicate-looking request but one idempotent debit;
- top-up PENDING;
- top-up REJECTED;
- top-up PROCESSED;
- authorized compensating adjustment;
- actual inconsistency.

If actual inconsistency is plausible, freeze mutations for the smallest safe scope.

**Staff must never:**

- edit ledger rows;
- directly set balance;
- delete a debit;
- add unexplained compensation;
- fabricate evidence.

Run `reconcileWalletSnapshot` / the restore verifier against an isolated recovery snapshot when appropriate.

Technical escalation is mandatory for chain break, duplicate financial commit, idempotency failure or unexplained balance drift.

## 24. Runbook — deposit made but wallet did not update

Inspect:

- top-up request;
- receipt;
- request status;
- audit;
- existing ledger reference/transaction link;
- previous processing attempt.

**Never blindly credit again.**

If PENDING, use normal approval after evidence review.

If PROCESSED, do not retry; investigate presentation/read-model issue.

If attempted processing has ambiguous outcome, freeze that request and perform reconciliation before any retry.

Close only when top-up state and authoritative ledger agree.

## 25. Runbook — duplicate debit/top-up suspected

**Severity:** SEV-1 when confirmed or credible.

1. freeze the affected mutation path;
2. preserve both request and ledger evidence;
3. check original idempotency/business references;
4. never delete a ledger row;
5. determine whether one or two financial commits actually occurred;
6. use controlled compensating recovery only after business approval;
7. reconcile the whole affected agency wallet;
8. scan same release/time window for wider exposure.

## 26. Runbook — agency says a document disappeared

Differentiate:

- permission/RBAC;
- replacement/version history;
- missing metadata;
- missing object;
- provider outage;
- historical/legacy reconciliation issue.

For final decisions, suspend reliance on the dossier until official evidence is restored/validated.

Preserve metadata, object key, version, upload/review audit and expected size/checksum.

Never fabricate the file.

Close only when the intended version is demonstrably accessible to the authorized actor or the unresolved state is explicitly documented.

## 27. Runbook — official decision file missing

**Severity:** SEV-2; potentially SEV-1 if systemic.

An APPROVED/REJECTED dossier without the required official persisted decision evidence is operationally incomplete.

1. preserve application/status/audit evidence;
2. block downstream reliance as necessary;
3. locate exact object/version in VERIFIED recovery copies;
4. restore only when identity is proven;
5. verify status-to-document relation;
6. scan other final decisions for the same mismatch.

Never recreate an official decision document from memory.

## 28. Runbook — user cannot login

First distinguish:

- incorrect credential;
- suspended user;
- activation/change-password state;
- expired/revoked session;
- broad Auth/database outage.

Do not create shared emergency credentials.

Use approved reset/activation flow. For compromise suspicion, follow compromised-account runbook instead.

## 29. Runbook — compromised agency account

1. suspend affected identity;
2. revoke/expire sessions using the established control;
3. preserve audit/session/resource evidence;
4. review document and financial actions;
5. rotate/reset credentials;
6. reconcile any affected financial operation;
7. notify the agency via an independent trusted contact path;
8. restore access only after impact is understood.

## 30. Runbook — compromised Staff or SUPER_ADMIN

**Staff compromise:** SEV-1 if privileged wallet/tenant/document operations may be affected.

**SUPER_ADMIN compromise:** SEV-1 immediately.

Contain:

- suspend trustedly;
- revoke sessions;
- restrict sensitive administrative actions;
- rotate related credentials if exposure is plausible.

Review:

- users/agencies;
- wallet/top-up activity;
- configuration;
- private-document access;
- deployment/config changes;
- attempts to alter audit evidence.

Do not investigate exclusively through the suspected compromised session.

Close only after trusted administrative control is re-established and scope is assessed.

## 31. Runbook — leaked credential

1. classify credential privilege/scope;
2. revoke/rotate promptly where exposure is credible;
3. preserve sanitized evidence of where exposure occurred;
4. update authorized systems;
5. verify old credential no longer works;
6. inspect for abuse during exposure window.

Deleting a leaked value from a log/source location without rotating it is not sufficient.

## 32. Runbook — cross-tenant/private-document exposure

**Severity:** SEV-1.

Priority:

**contain -> preserve evidence -> stop further access -> determine scope -> remediate -> verify -> communicate.**

Restrict the affected route/function/account; use broader maintenance only if necessary.

Never delete logs during panic response.

Re-run tenant-isolation tests and scope the affected resources before closure.

Operational notification and any legal/regulatory notification decision are separate matters.

## 33. Runbook — wrong configuration disables workflow

Contain the affected workflow if incorrect configuration could create invalid writes.

Preserve before/after config and actor audit.

Restore the known prior configuration/version rather than resetting the database.

Validate the full affected workflow before closure.

## 34. Runbook — accidental reset/delete or wrong-environment script

**Severity:** SEV-1.

1. stop the process;
2. freeze writes;
3. preserve current damaged state/evidence;
4. record operator/action/environment/timestamp;
5. do not rerun the destructive script;
6. identify first damaged event and last known-good point;
7. choose isolated restore/recovery strategy;
8. reconcile wallet/storage;
9. require Owner + Technical approval before Production recovery;
10. strengthen the failed guard after closure.

## 35. Pilot continuity

For the first pilot agencies:

Daily:

- verify current backup health;
- verify off-site-copy health;
- review failed backup/monitoring jobs;
- review wallet-integrity indicators.

If the portal is unavailable, use a minimal continuity queue containing only:

- incident ID;
- agency;
- internal application/request reference when known;
- requested action;
- timestamp;
- Staff owner.

Do not perform undocumented wallet changes offline.

Do not pretend a submission completed while its commit state is unknown.

After restoration, re-enter queued business actions through the normal controlled workflow, preserve the outage reference, allow normal idempotency/wallet logic to run once, verify, then close the continuity item.

Do not move private visa files into personal messaging/file-sharing accounts as an improvised continuity mechanism.

## 36. Drill schedule

Before first pilot:

- one complete isolated restore;
- one DB/storage reconciliation;
- one wallet reconciliation;
- one bad-deployment rollback drill;
- one fail-closed wrong-environment test;
- one backup-before-reset dependency test.

Early pilot:

- daily backup-health check;
- monthly restore verification;
- quarterly full DR exercise when operations stabilize;
- quarterly recovery-access review.

Avoid drills that impose unnecessary load on the three-person operations team.

## 37. Pre-go-live DR checklist

Release:

- [ ] release candidate/HEAD recorded;
- [ ] migration set finalized;
- [ ] backward compatibility reviewed.

Environment:

- [ ] Production project identity verified;
- [ ] `visa_os` verified;
- [ ] Preview cannot be confused with Production.

Backup:

- [ ] fresh database copy;
- [ ] encrypted;
- [ ] checksum verified;
- [ ] schema/critical tables/row-count evidence captured;
- [ ] sequence/migration evidence captured;
- [ ] storage backup/inventory captured;
- [ ] independent/off-site copy verified.

Restore:

- [ ] isolated restore completed;
- [ ] `npm run dr:restore-verify` PASS;
- [ ] application login/read checks pass;
- [ ] tenant isolation passes;
- [ ] wallet reconciliation passes;
- [ ] document access and final-decision evidence pass.

Reset/release:

- [ ] backup manifest is VERIFIED;
- [ ] reset dry-run only until explicit Owner authorization;
- [ ] rollback plan recorded;
- [ ] monitoring active;
- [ ] emergency contacts/roles known.

No real Production reset is authorized by this document.

## 38. DR gate verdict

### PASS

Requires concrete evidence of:

- encrypted database backup;
- verified independent/off-site copy;
- valid manifest;
- isolated restore;
- critical schema checks;
- wallet reconciliation;
- database/storage reconciliation;
- critical decision/top-up evidence;
- application/tenant-isolation validation;
- fail-closed environment tooling;
- reset backup dependency;
- rollback procedure;
- runbooks and ownership.

### PARTIAL

Only when remaining work is external/configurational or non-critical and no release-critical integrity condition is unproven.

PARTIAL must not hide:

- untested restore;
- unreconciled wallet;
- unknown Storage integrity;
- ambiguous Production/Preview targeting;
- unencrypted/inaccessible backup.

### FAIL

Any of:

- no tested isolated restore;
- backup inaccessible/corrupt/unverified;
- no independent recovery copy;
- wallet cannot reconcile;
- missing critical private documents without recovery;
- wrong-environment tooling can proceed silently;
- reset can proceed without VERIFIED recovery evidence;
- secrets are emitted into reports;
- tenant isolation fails after restore.

## 39. What remains external to repository code

The repository can enforce verification contracts but cannot itself prove external services that have not been configured.

Before final PASS an authorized operator must still provide evidence for:

1. actual encrypted Production database backup generation;
2. actual independent/off-site copy;
3. actual encryption-key custody/recovery;
4. actual isolated restore into a disposable environment;
5. application behavior and tenant-isolation checks against that restored environment;
6. actual provider backup/PITR entitlement and retention, if relied on;
7. Owner approval for Production restore/reset authority;
8. secure incident-contact path.

These are evidence/configuration tasks, not reasons to rebuild repository controls.
