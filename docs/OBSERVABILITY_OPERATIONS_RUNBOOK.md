# ESSAFARIA VISA OS — Observability Operations Runbook

Status: provider-agnostic operational runbook  
Scope: Preview validation now; Production only after explicit release authorization

## 1. Evidence rules

For every incident, capture only:

- UTC timestamp/window
- environment
- release SHA
- request ID when available
- event name
- safe error code
- affected route/action
- aggregate count/rate/duration
- integrity/DB health status

Never paste or export:

- Authorization/Cookie headers
- passwords or tokens
- database URLs
- applicant/passport data
- document bodies or filenames
- raw agency/user/application/document IDs
- signed URLs
- request/response bodies

Use pseudonymous tenant/resource references only.

## 2. First five minutes

1. Confirm environment and release SHA.
2. Check public readiness `/api/health/ready`.
3. If operator access is available, check:
   - `/api/internal/health/deep`
   - `/api/internal/health/database`
   - `/api/internal/health/integrity`
4. Compare the event family with `docs/observability-alert-policy.json`.
5. Determine whether this is:
   - safely prevented business input;
   - isolated dependency/notification degradation;
   - application technical failure;
   - data-integrity failure.
6. Do not retry financial mutations blindly when the original request may have committed.
7. Do not modify Production data manually during triage.

## 3. SEV-1 playbooks

### integrity.violation

Immediate actions:

- stop manual financial/status correction attempts;
- capture the aggregate integrity report and release SHA;
- determine which invariant count is non-zero;
- inspect the corresponding audit/ledger records using authorized internal tooling only;
- verify whether the anomaly predates `cutoverAt`;
- if post-cutover, treat as active data-integrity incident;
- do not repair rows directly until the authoritative mutation path and audit consequences are understood.

Recovery criteria:

- root cause identified;
- unsafe mutation path disabled/fixed;
- integrity report returns zero for all post-cutover critical checks;
- targeted regression passes;
- incident evidence retained without PII.

### confirmed cross-tenant/private-document exposure

Immediate actions:

- stop the affected endpoint/release path;
- preserve request ID, release SHA and timestamps;
- revoke exposed signed/temporary access if applicable;
- verify tenant authorization path;
- rotate only credentials actually exposed;
- do not include affected document/applicant contents in incident chat or tickets.

Recovery criteria:

- access-control defect fixed;
- tenant-isolation tests pass;
- no active unauthorized access path remains;
- security/privacy owner reviews incident scope.

### global outage / database unavailable

Immediate actions:

- compare liveness vs readiness:
  - live healthy + ready unavailable => dependency/DB path;
  - both unavailable => application/platform path;
- inspect Vercel runtime/build status;
- inspect DB connection utilization, waits and long transactions;
- avoid redeploy loops when the dependency is the cause.

Recovery criteria:

- multiple consecutive readiness successes;
- DB wait/connection indicators stable;
- technical-failure rate returns to baseline.

## 4. SEV-2 playbooks

### wallet/top-up/price technical failures

- separate `SAFE_PREVENTION` from `technical_failed`;
- verify ledger arithmetic/continuity and current balance reconciliation;
- check idempotency/one-charge protections;
- for a user-visible failure after a possible commit, use the ledger/audit trail before retrying.

### storage failures

- distinguish NOT_FOUND from provider read/write/delete failures;
- correlate via request ID/resource pseudonym;
- verify provider availability and credential configuration;
- never log storage keys, filenames or signed URLs.

### authentication technical failures

- compare `auth.login.rejected` with `auth.login.technical_failed`;
- expected invalid credentials are not incidents;
- inspect DB/session dependency failures and suspended-account prevention separately.

### release protection drift

For `release.protections.missing` or `release.protection_check.failed`:

- block release progression;
- verify migrations 0020–0024;
- verify required triggers/constraint/indexes;
- verify `anon`/`authenticated` have no Preview schema/table/routine access;
- do not recreate or renumber upstream migrations from this branch.

## 5. Notification failures

`notification.delivery.failed` is intentionally post-commit best effort.

- the business mutation may already be successful;
- confirm authoritative wallet/application/document state first;
- retry notification delivery separately if a retry mechanism exists;
- never reverse a committed business operation solely because notification delivery failed.

## 6. Production cutover safety

Before enabling Production observability:

1. record the exact UTC activation instant;
2. configure `OBSERVABILITY_CUTOVER_AT` to that instant;
3. configure fresh Production-only operator/pseudonymization secrets;
4. verify protected integrity output reports the expected `cutoverAt`;
5. verify release protections are healthy;
6. only then enable external alert routing.

If Production `OBSERVABILITY_CUTOVER_AT` is absent or invalid, integrity monitoring deliberately returns `unavailable`.

## 7. Recovery / resolution

Resolve an incident only after:

- the triggering condition is no longer present;
- at least two consecutive health checks succeed for availability incidents;
- integrity violations return to zero for post-cutover checks;
- the relevant targeted tests/build pass if code changed;
- a recovery notification is observed when external alerting is configured.

## 8. Post-incident record

Record:

- start/end UTC
- environment/release SHA
- event family and safe error codes
- customer/business impact in aggregate
- root cause
- remediation
- tests/evidence
- follow-up owner

Do not include PII, documents, raw identifiers, credentials or request bodies.

## 9. GitHub-native watchdog

Launch alert delivery does not require Datadog.

The recurring workflow `.github/workflows/observability-watchdog.yml` is the operational fallback. On actionable Preview incidents it opens or updates one GitHub issue named:

`[Observability Watchdog] Active Preview incident`

Use the linked Actions run and its JSON artifact as the first evidence source. Do not copy raw runner environment, secret values or private document/business data into the issue.

A healthy later run comments with recovery evidence and closes the issue automatically.

SEV3/transient DB degradation remains in the Actions summary/artifact and does not open an incident. This is deliberate alert-fatigue control.

The schedule is best-effort and becomes recurrent only once the workflow exists on the repository default branch.
