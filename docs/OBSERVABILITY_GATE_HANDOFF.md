# ESSAFARIA VISA OS — Observability Gate Handoff

Status: Preview implementation branch  
Branch: `observability/preprod-gate-2026-10-03`  
Base: `release/essafaria-rc-2026-09` @ `0ebf3198d84c8a9aa9fbe8a9927645eb95d7f6c4`  
Production deployment: **NOT AUTHORIZED / NOT PERFORMED**

## 1. Implemented controls

### Public health

- `GET /api/health`: minimal readiness response only.
- `GET /api/health/ready`: minimal readiness alias.
- `GET /api/health/live`: runtime liveness only.
- Public endpoints never expose DB host, schema name, migrations, release SHA, credentials or exception text.

### Protected operator health

Disabled with a 404 unless `HEALTHCHECK_TOKEN` is configured with at least 32 bytes of entropy-bearing material.

- `GET /api/internal/health/deep`
  - DB reachability
  - structural table/schema validation
  - migration ledger
  - environment/release metadata
- `GET /api/internal/health/database`
  - connection utilization
  - active/idle/waiting connections
  - lock waits
  - transactions > 60s
  - deadlocks/rollbacks since stats reset
  - DB/schema size
  - temp-file counters
  - pg_stat_statements aggregate latency
- `GET /api/internal/health/integrity`
  - wallet invariants
  - application-charge uniqueness
  - processed-top-up linkage
  - final-decision document invariant
  - DB document-blob integrity
  - legacy vs post-cutover anomalies

Release protections are also verified read-only in Preview/Production:
- upstream migrations `0020`–`0024`
- official-final-decision trigger
- price-adjustment immutability trigger
- top-up credit-proof trigger
- wallet-transaction immutability trigger
- non-negative wallet balance constraint
- idempotency / one-charge / top-up linkage unique indexes
- no `anon` / `authenticated` schema USAGE
- no `anon` / `authenticated` table or routine grants

Operator authorization hashes configured/supplied bearer tokens to fixed-length SHA-256 digests before constant-time comparison, and weak configured tokens fail closed as disabled.

## 2. Structured telemetry

Core: `src/lib/observability.ts`

Every structured event can include:

- timestamp
- environment
- release SHA
- request/correlation ID
- event name
- severity
- classification
- action
- result
- safe error code
- duration
- actor role
- pseudonymous tenant/resource references
- allowlisted/sanitized metadata

Classifications:

- `SAFE_PREVENTION`
- `BUSINESS_FAILURE`
- `DATA_INTEGRITY_FAILURE`

### Privacy controls

Core redaction: `src/lib/safe-error.ts`

Telemetry removes or redacts:

- passwords
- Authorization/Cookie material
- access/refresh/reset/session tokens
- secrets and service-role values
- DB URLs / connection URIs
- signed URLs
- email addresses
- request/response bodies
- passport / national-ID keyed data
- document/file bodies
- parameter dumps
- raw IPv4 addresses
- UUID-like business identifiers in free-form error text
- managed database hostnames
- filesystem paths
- raw business identifiers/references placed in metadata
- filenames and storage keys

`TELEMETRY_PSEUDONYMIZATION_KEY` enables stable HMAC-based pseudonymous identifiers only when it is at least 32 bytes. If absent or weak, raw tenant/user identifiers are not substituted into telemetry.

## 3. Instrumented critical flows

### Authentication / security

- `auth.login.succeeded`
- `auth.login.rejected`
- `auth.login.technical_failed`
- `auth.session.create_failed`
- `auth.session.resolve_failed`
- `auth.session.destroy_failed`
- `auth.authenticate.query_failed`
- `auth.authenticate.agency_lookup_failed`
- `security.session.invalid_or_expired`
- `security.suspended_user_access.prevented`
- `security.suspended_agency_access.prevented`
- `security.authorization.denied`
- `security.cross_tenant_access.denied`

### Applications

- `application.submission.succeeded`
- `application.submission.idempotency_prevented`
- `application.submission.technical_failed`
- `application.status_transition.succeeded`
- `application.status_transition.prevented`
- `application.decision.blocked_missing_document`
- `application.decision.succeeded`
- `application.decision.prevented`
- `application.decision.technical_failed`

Final APPROVED / REJECTED now requires an official decision document server-side and in the Staff UI.

### Wallet / finance

- `wallet.debit.succeeded`
- `wallet.debit.prevented`
- `wallet.debit.technical_failed`
- `wallet.negative_balance_prevented`
- `wallet.adjustment.succeeded`
- `wallet.adjustment.technical_failed`
- `wallet.topup.request.created`
- `wallet.topup.request.prevented`
- `wallet.topup.request.technical_failed`
- `wallet.topup.credited`
- `wallet.topup.rejected`
- `wallet.topup.duplicate_prevented`
- `wallet.topup.prevented`
- `wallet.topup.technical_failed`
- `wallet.price_adjustment.succeeded`
- `wallet.price_adjustment.idempotency_prevented`
- `wallet.price_adjustment.prevented`
- `wallet.price_adjustment.technical_failed`
- `wallet.surcharge.prevented`

### Documents / storage

- `document.upload.succeeded`
- `document.persistence.failed`
- `document.resubmission.succeeded`
- `document.download.succeeded`
- `document.download.prevented`
- `document.download.technical_failed`
- private document download responses include an opaque `X-Request-ID` matching the structured log correlation ID
- `document.request.created`
- `document.request.fulfilled`
- `storage.put.failed`
- `storage.get.failed`
- `storage.delete.failed`

### Post-commit side-effect safety

Critical committed operations now use observable best-effort notifications so a notification outage cannot make the UI report a false business failure after a wallet/status/document write has already committed. Failures emit `notification.delivery.failed` without title/body/recipient identifiers.

### Framework-level error capture

- `src/instrumentation.ts` uses the stable Next.js `onRequestError` hook.
- `next.request.unhandled_error` captures otherwise-uncaught server errors.
- Only framework-owned route templates, method and render context are logged.
- Raw request paths, query strings, headers, cookies and bodies are deliberately excluded.

### Infrastructure / audit

- `database.configuration.missing`
- `database.pool.error`
- `database.observability_snapshot.failed`
- `health.readiness.failed`
- `audit.persistence_failed`
- `action.technical_failed`
- `notification.application_submission.failed`
- `notification.delivery.failed`
- `integrity.check.failed`
- `integrity.configuration.invalid`
- `integrity.violation`
- `release.protection_check.failed`
- `release.protections.missing`
- `wallet.configuration.degraded`

## 4. Integrity semantics

The monitor intentionally separates historical anomalies from new integrity failures.

Preview retains the validated baseline of `2026-10-03T00:00:00.000Z`. Production does **not** inherit that timestamp: `OBSERVABILITY_CUTOVER_AT` must be set to the real UTC activation instant before Production monitoring is enabled. Missing or invalid Production configuration fails closed as `unavailable`, preventing pre-deployment writes from being mislabeled as new corruption.

### Critical post-cutover failures

Any non-zero count is a violation:

- negative wallet balance
- post-DZD-cutover non-DZD agency wallet
- post-DZD-cutover non-DZD ledger row
- ledger arithmetic mismatch
- ledger continuity break
- current agency balance != latest ledger balance
- duplicate APPLICATION_CHARGE
- processed top-up without valid matching credit
- final APPROVED/REJECTED decision after observability cutover without official document
- post-observability-cutover DB document row without DB blob when STORAGE_PROVIDER=db

A violation emits `integrity.violation` as:

- severity: `critical`
- classification: `DATA_INTEGRITY_FAILURE`

### Historical/degraded only

Historical anomalies remain visible but do not page as new corruption:

- legacy non-DZD agency wallets
- legacy non-DZD ledger rows
- legacy final decisions missing official document
- legacy DB document rows missing blobs

## 5. Preview-only CLI evidence

The unified command refuses any schema other than `visa_os_preview`, refuses Production environment semantics, pins the validated Preview cutover when needed, and verifies integrity + DB health + upstream release protections in one report.

```bash
npm run observability:gate:preview
```

The narrower read-only diagnostics remain available as `observability:finance:preview` and `observability:db:preview`.

Deployment verification is also implemented in `scripts/verify-preview-deployment.ts` / `npm run observability:verify:preview`. It validates the three public health routes, protected operator-route semantics, response privacy, release SHA, release-protection health and integrity cutover reporting. A manual GitHub Actions job accepts a Preview URL and optional Preview-environment bypass/operator secrets.

The runtime verifier accepts only ESSAFARIA `newproject-*-essafaria-travel-s-projects.vercel.app` HTTPS origins, rejects Production/arbitrary hosts/credentials/ports/path/query fragments, and follows redirects only when they remain on the exact approved HTTPS host. This prevents workflow-dispatch inputs from exfiltrating the Vercel bypass or operator token.

## 6. CI gate

Workflow:

`.github/workflows/observability-verification.yml`

Draft PR:

`#8 Observability Gate — Preview-only implementation`

Jobs:

### Typecheck, lint, tests, build

- npm ci
- typecheck
- lint
- targeted observability/integrity/financial tests
- full deterministic regression
- production build

No DB credentials are available to this job.

### Preview DB observability evidence

Uses the existing GitHub `Preview` environment only.

- `PREVIEW_DATABASE_URL`
- hard-pinned `DATABASE_SCHEMA=visa_os_preview`
- no migrations
- no writes
- financial/workflow integrity check
- database observability snapshot
- upstream migration/trigger/constraint/index verification
- Preview API privilege-lockdown verification

## 7. Preview evidence captured on 2026-10-03

### Database health

- status: healthy
- max connections: 60
- observed connections: 7
- utilization: 11.7%
- active waiting: 0
- lock waiting: 0
- transactions >60s: 0
- deadlocks since stats reset: 0
- pg_stat_statements: enabled

The historical >500 ms pg_stat_statements entries were inspected. The largest entries were platform/maintenance/backup/catalog operations rather than evidence of a current application hot path. The application-only filter now excludes backup/restore/catalog/migration SQL and reported **0 application statements with mean execution time >500 ms** on Preview at verification time. pg_stat_statements is cumulative since its reset and is not used alone to declare current DB degradation.

### Integrity

Status: degraded, not violation.

Post-cutover critical counts:

- negative balances: 0
- post-cutover non-DZD agencies: 0
- post-cutover non-DZD ledger rows: 0
- wallet arithmetic anomalies: 0
- ledger continuity anomalies: 0
- balance mismatches: 0
- duplicate application charges: 0
- processed top-up anomalies: 0
- post-cutover final decisions without official document: 0
- post-cutover missing DB blobs: 0

Historical baseline retained as degraded evidence:

- legacy non-DZD agencies: 2
- legacy non-DZD ledger rows: 4
- legacy final decisions without official decision document: 1
- legacy missing DB blobs: 3

The 3 historical missing DB blobs were created on 2026-09-23/24 and no matching Supabase Storage object exists. They are baseline legacy data, not a new write regression.

## 8. Upstream migration dependency

The observability branch intentionally contains repository migrations only through `0019_config_translations.sql`, because it was branched from the validated RC baseline and must not duplicate migrations owned by other release gates.

The live Preview database used for evidence is currently through `0024_preview_api_lockdown.sql` and includes these upstream migrations:

- `0020_identity_security.sql`
- `0021_business_invariants.sql`
- `0022_registration_review.sql`
- `0023_operations_legal.sql`
- `0024_preview_api_lockdown.sql`

Observed Preview protections include:

- enabled official-final-decision DB trigger;
- enabled top-up credit-proof trigger;
- enabled immutable wallet-transaction trigger;
- non-negative agency-balance constraint;
- unique application-charge protection;
- Preview API lockdown: `anon` and `authenticated` have no schema USAGE, table grants or routine grants on `visa_os_preview`.

Do **not** recreate or renumber 0020–0024 in this observability branch. Final release integration must include the authoritative upstream gate migrations before Production Observability can be declared fully reproducible.

## 9. Initial alert policy

### SEV-1

Immediate:

- `integrity.violation`
- confirmed cross-tenant disclosure
- private-document exposure
- actual duplicate credit/charge
- persisted negative balance
- credential exposure
- global Production outage / DB outage

### SEV-2

Investigate promptly:

- sustained critical-route 5xx
- repeated wallet technical failures
- broad upload/storage failures
- broad auth failure
- DB connection utilization >=85% for 5 min
- repeated active lock waits
- sustained critical-operation latency regression

### SEV-3

Business-hours:

- noncritical latency degradation
- isolated recoverable failures
- historical/degraded integrity baseline
- unusual but denied authorization bursts

Expected business rejections and safely prevented idempotency conflicts are not urgent incidents.

## 10. External-only work still required

These items cannot be completed from the current connected tools and must not be simulated.

1. **Vercel**
   - current Preview deployment is Ready: `dpl_Gmq6eri9ZR6iw1SGb5PSr5Rh6dtr`
   - Preview URL: `https://newproject-git-observability-028195-essafaria-travel-s-projects.vercel.app`
   - Deployment Protection is active
   - current connected Vercel app is not authorized for workspace `essafaria-travel-s-projects` (`team_KlSuy7Z6To4vppiHgR0KhrLK`); re-authentication to that scope is required to obtain a bypass, inspect Runtime Logs, or configure Preview variables
   - configure Preview-only:
     - `HEALTHCHECK_TOKEN`
     - `TELEMETRY_PSEUDONYMIZATION_KEY` (minimum 32 bytes)
   - confirm structured events in Runtime Logs
   - confirm release SHA/environment fields
   - verify public and protected health routes on the actual Preview deployment

2. **External uptime / incident delivery**
   - configure one provider (Better Stack or equivalent)
   - public readiness check: 1–2 min
   - public login/main page check: 2–5 min
   - alert after 2–3 consecutive failures
   - test one safe alert and one recovery notification

3. **Optional exception tracker**
   - Sentry is optional if Vercel Runtime Errors + structured logs satisfy launch needs
   - if enabled: privacy-first configuration, no session replay initially, private source maps, environment/release separation

4. **Production**
   - no observability deployment/configuration should occur until later explicit authorization.

## 11. Codex minimal verification instructions

Codex must NOT re-audit the whole application.

Only:

1. inspect this handoff;
2. verify exact branch/HEAD;
3. read the final CI result for PR #8;
4. inspect only failing checks, if any;
5. after Vercel workspace authorization / protection bypass is available, verify the existing Ready Preview deployment with `npm run observability:verify:preview`;
6. configure/test only missing external monitoring integrations if access is provided;
7. return PASS/PARTIAL/FAIL evidence.

Do not redesign logging, wallet, auth, document, health, integrity or DB observability unless a failing test proves a defect.


## 12. Operational artifacts

Provider-independent operational material is committed with the gate:

- `docs/OBSERVABILITY_OPERATIONS_RUNBOOK.md` — triage, severity-specific response, recovery and privacy-safe evidence rules.
- `docs/observability-dashboard-spec.json` — dashboard panels, monitors, privacy-forbidden dimensions and recovery semantics.
- `docs/observability-alert-policy.json` — routing thresholds and deduplication contract.

CI parses and validates these artifacts so critical integrity/release-protection routing and privacy constraints cannot drift silently.


## 13. CI evidence artifacts

Successful/failed Gate executions preserve privacy-safe machine-readable evidence:

- `observability-preview-evidence-<sha>` — DB health, integrity and release-protection Gate result.
- `observability-runtime-evidence-<sha>` — deployed Preview health/runtime verification when manually invoked with `preview_url`.

No credentials, raw business identifiers, request bodies or document content are intentionally written to these artifacts.

## GitHub-native launch watchdog

Datadog is **not required** for launch.

`.github/workflows/observability-watchdog.yml` provides the provider-free launch fallback:

- scheduled every 30 minutes at minutes 07 and 37 once the workflow is present on the repository default branch;
- read-only Preview DB/integrity/release-protection probe;
- optional protected Preview runtime probe when the Vercel automation bypass is available;
- SEV1 only for post-cutover integrity violations;
- SEV2 for unavailable integrity/DB monitoring or release-protection drift;
- SEV3 database degradation remains non-paging evidence to reduce alert fatigue;
- GitHub issue opened/updated on SEV1/SEV2;
- automatic recovery comment + issue close when healthy again;
- 30-day privacy-safe JSON evidence artifacts.

GitHub scheduled workflows are best-effort, not SLA-grade external uptime. A dedicated uptime provider remains an optional later upgrade, not a release blocker.

See `docs/OBSERVABILITY_GITHUB_WATCHDOG.md`.

