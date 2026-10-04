# Observability external configuration checklist

This file contains only work that depends on vendor/account access. Application instrumentation and Preview DB evidence are already implemented elsewhere on this branch.

## Vercel Preview

Do not configure Production.

Required Preview-only server variables:

- `HEALTHCHECK_TOKEN`: new high-entropy random value, minimum 32 bytes; never expose with `NEXT_PUBLIC_`.
- `TELEMETRY_PSEUDONYMIZATION_KEY`: separate high-entropy random HMAC key, minimum 32 bytes; never reuse the health token.
- Preview uses the validated cutover baseline `2026-10-03T00:00:00.000Z`.
- For a later Production activation, set `OBSERVABILITY_CUTOVER_AT` to the exact UTC instant immediately before enabling the observability release. Production integrity checks deliberately return unavailable if this value is absent or invalid.

After a Preview deployment is available, the repository provides:

```bash
PREVIEW_BASE_URL="https://<preview>.vercel.app" npm run observability:verify:preview
```

For a Vercel-protected Preview, also provide the server-only `VERCEL_AUTOMATION_BYPASS_SECRET`. If `HEALTHCHECK_TOKEN` is available to the verifier, protected health endpoints and release SHA are fully validated; otherwise the verifier reports them as configured-but-unverified.

Verify:

1. `GET /api/health/live` => 200 and minimal JSON.
2. `GET /api/health/ready` => 200 and minimal JSON.
3. `GET /api/health` => 200 and minimal JSON.
4. `GET /api/internal/health/deep` without bearer => 401 when token exists.
5. Same endpoint with correct bearer => 200, no DB host/URI/PII.
6. `GET /api/internal/health/database` with correct bearer => 200 and aggregate DB metrics.
7. `GET /api/internal/health/integrity` with correct bearer => 200 for healthy/degraded, 503 for violation/unavailable.
8. Trigger one safe business rejection in Preview and confirm a structured JSON event contains environment + release SHA but no raw e-mail/IP/tenant ID.
9. Trigger one safe synthetic technical error only in Preview if an existing test hook is available; do not create a public failure endpoint merely for testing.
10. Confirm no document body, Authorization header, cookie, DB URI or signed URL is present in Runtime Logs.

Deployment-specific project, team, deployment, and Preview URL identifiers are intentionally not recorded here. Confirm access and current deployment state in the Vercel workspace before running any Preview verifier. This assembly does not configure Vercel variables or contact a deployment.

## External uptime / incident provider

One provider only at launch.

Suggested checks:

- `/api/health/ready`: every 1-2 minutes.
- login entry page: every 2-5 minutes.
- public main page: every 5 minutes.

Initial failure policy:

- alert only after 2-3 consecutive failures;
- timeout approximately 10 seconds;
- require stable recovery/multiple successful probes before resolved notification.

Do not put real Staff/customer credentials into a basic uptime monitor.

If the provider supports secret HTTP headers, a protected integrity/database monitor can be added using `HEALTHCHECK_TOKEN`; otherwise keep protected endpoints out of the external public monitor.

## Alert routing

Use `docs/observability-alert-policy.json` as the source of truth.

At launch:

- SEV-1 => phone/push + incident channel.
- broad SEV-2 availability/finance => phone/push + channel.
- normal SEV-2 => channel/e-mail.
- SEV-3 => business hours.
- SEV-4 => dashboard/summary only.

Test before Gate PASS:

1. one safe alert reaches the chosen destination;
2. duplicate occurrences group into one incident;
3. one recovery/resolved notification is received.

## Error tracking

Do not add another vendor unless Vercel Runtime Errors + structured logs are insufficient.

If Sentry (or equivalent) is enabled:

- Preview and Production must be separate environments;
- attach release SHA;
- source maps must remain private;
- disable unnecessary PII;
- do not send request bodies, Authorization/Cookie headers, document payloads or signed URLs;
- keep session replay disabled initially;
- perform a safe Preview exception test and inspect the event payload before any Production enablement.

## Production

Production remains out of scope until explicit authorization.

Before later Production activation:

- create fresh Production-only secrets, distinct from Preview;
- copy only approved alert policy, never Preview credentials;
- verify public health disclosure remains minimal;
- test one non-destructive alert/recovery path;
- record the final observability Gate verdict and evidence.


## GitHub Actions manual runtime verification

Once Vercel workspace access/bypass is available:

1. Open GitHub Actions → **Observability Gate verification**.
2. Choose **Run workflow** on `observability/preprod-gate-2026-10-03`.
3. Enter the current Vercel Preview URL in `preview_url`.
4. The `Preview` GitHub environment may optionally provide:
   - `VERCEL_AUTOMATION_BYPASS_SECRET` for Vercel Deployment Protection;
   - `HEALTHCHECK_TOKEN` for full protected endpoint/release-SHA verification.
5. The runtime job runs only after code + Preview DB gates pass.
6. Download the generated `observability-runtime-evidence-<sha>` artifact.

The Preview DB job also uploads `observability-preview-evidence-<sha>` containing only privacy-safe aggregate Gate output.

If the operator token is configured on Vercel but unavailable to GitHub, the runtime verifier reports protected endpoints as `configured_unverified` instead of pretending they were fully tested.

The verifier explicitly refuses `visa.essafariavoyages.com` and any host outside the ESSAFARIA `newproject-*-essafaria-travel-s-projects.vercel.app` Preview namespace. It also refuses URL credentials, non-standard ports, paths/query/fragments, and cross-host redirects, so a malicious workflow input cannot send bypass/operator secrets to an arbitrary destination.


## GitHub-native fallback

Datadog is not required for launch.

The repository includes `.github/workflows/observability-watchdog.yml`, which provides scheduled Preview integrity/DB monitoring, optional protected-runtime monitoring, GitHub incident issue lifecycle and 30-day evidence artifacts.

GitHub scheduling is best-effort and activates from the repository default branch. A dedicated external uptime provider can be added later if ESSAFARIA requires SLA-grade probing or SMS/phone escalation.
