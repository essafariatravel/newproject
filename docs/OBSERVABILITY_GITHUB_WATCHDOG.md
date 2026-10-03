# ESSAFARIA VISA OS — GitHub-Native Observability Watchdog

Status: implemented, provider-free launch fallback  
Scope: Preview now; Production remains separately gated

## Purpose

This watchdog replaces the need for Datadog at launch. It uses infrastructure already controlled by ESSAFARIA:

- GitHub Actions for scheduled probes and evidence;
- Supabase/PostgreSQL for database/integrity signals;
- Vercel health endpoints for runtime verification when the Preview protection bypass is available;
- GitHub Issues as the incident lifecycle;
- GitHub account notifications/e-mail as the launch notification channel.

It does not install an agent, copy passport/document data to a third-party APM, or modify business data.

## Cadence

`.github/workflows/observability-watchdog.yml` schedules checks at:

- minute 07;
- minute 37;

of every hour.

GitHub scheduled workflows are best-effort and are not an SLA-grade external uptime service. GitHub executes scheduled workflows from the repository default branch. The recurring schedule therefore activates only after the workflow reaches the default branch through the approved release process.

The same workflow can also be run manually with `workflow_dispatch`.

## Preview DB / integrity watchdog

Every active run executes:

```bash
npm run observability:watchdog:preview
```

The probe is read-only and refuses any schema other than `visa_os_preview`.

It checks:

- financial/workflow integrity;
- negative balances;
- wallet ledger arithmetic/continuity;
- current balance reconciliation;
- duplicate application charges;
- top-up ledger linkage;
- final-decision official-document invariant;
- document blob presence post-cutover;
- database availability/connections/waits/long transactions;
- release migrations 0020–0024;
- required financial/decision triggers;
- required constraints/indexes;
- Preview API lockdown for `anon` and `authenticated`.

## Noise control

The watchdog pages only actionable conditions:

- **SEV1 / job failure**: post-cutover integrity violation.
- **SEV2 / job failure**: integrity monitor unavailable, DB observability unavailable, or release-protection drift/unavailability.
- **SEV3 / successful job**: transient DB degradation such as connection warning, wait/lock, or long transaction snapshot.
- **OK / successful job**: healthy or known legacy-only integrity baseline.

The known historical Preview baseline therefore does not create an incident.

## Runtime watchdog

When `VERCEL_AUTOMATION_BYPASS_SECRET` exists in the GitHub Preview environment, the scheduled job verifies the protected Preview runtime.

It checks:

- `/api/health/live`;
- `/api/health/ready`;
- `/api/health`;
- protected deep/database/integrity endpoints when `HEALTHCHECK_TOKEN` is available;
- minimal public payload;
- `Cache-Control: no-store`;
- release SHA when configured;
- release-protection health;
- integrity cutover reporting;
- absence of sensitive diagnostics.

If the Vercel bypass is not configured, the runtime job reports `skipped_missing_bypass` and does not create a false incident.

The verifier only accepts ESSAFARIA `newproject-*-essafaria-travel-s-projects.vercel.app` HTTPS origins and never follows a redirect to another host.

## Incident lifecycle

On SEV1/SEV2 watchdog failure, GitHub automatically opens or updates one issue:

`[Observability Watchdog] Active Preview incident`

The issue contains only:

- severity;
- Preview environment;
- commit SHA;
- safe aggregate job status/reasons;
- GitHub Actions evidence URL.

It never contains credentials, applicant/passport/document data, filenames, storage keys, database URLs or raw business identifiers.

When a later scheduled/manual run is healthy, the workflow comments with recovery evidence and closes the open watchdog issue automatically.

## Evidence

Every Preview DB/integrity run uploads:

`observability-watchdog-preview-<run_id>`

Every enabled runtime run uploads:

`observability-watchdog-runtime-<run_id>`

Retention: 30 days.

The GitHub Actions job summary also records the safe severity/status/reasons.

## Required GitHub Preview environment values

Already required:

- `PREVIEW_DATABASE_URL`

Optional runtime capability:

- `VERCEL_AUTOMATION_BYPASS_SECRET`
- `HEALTHCHECK_TOKEN` (minimum 32 bytes)
- repository/environment variable `OBSERVABILITY_PREVIEW_URL` to override the currently known Preview URL
- repository/environment variable `OBSERVABILITY_EXPECTED_RELEASE_SHA` when strict deployed-release matching is required

No Production secret or URL is required by this watchdog.

## Production

This workflow is intentionally Preview-scoped.

Do not repoint it to Production. A Production watchdog must be activated only after:

1. authorized Production deployment;
2. exact `OBSERVABILITY_CUTOVER_AT`;
3. Production-only secrets;
4. release-protection/integrity verification;
5. explicit Production monitoring approval.

## External-provider upgrade path

Datadog is not required.

A dedicated uptime/incident provider may later be added if ESSAFARIA needs:

- sub-30-minute probing;
- SLA-grade external vantage points;
- SMS/phone/push escalation independent of GitHub;
- richer long-term metric retention.

Until then, GitHub + Vercel + Supabase provide the launch observability baseline without adding another data processor.
