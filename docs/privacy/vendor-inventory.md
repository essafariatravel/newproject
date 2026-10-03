# ESSAFARIA VISA OS — Vendor / Data Location Technical Inventory

Status: engineering facts gathered on 2026-10-03. Legal transfer/DPA/controller-processor conclusions are intentionally left to Owner/legal counsel.

| Vendor / component | Verified technical fact | Data categories potentially involved | Remaining Owner/legal input |
| --- | --- | --- | --- |
| Supabase project | Connected project is active in `us-east-1`. Organization is currently Free tier. Primary project services are therefore hosted in that selected project region. | PostgreSQL application data; optional Storage objects; platform logs/backups according to Supabase service configuration | DPA/contract review; transfer mechanism/adequacy analysis; approved vendor role; approved retention requirements |
| PostgreSQL schemas | Application uses private schemas `visa_os` and `visa_os_preview`. On 2026-10-03, database roles `anon` and `authenticated` had no USAGE privilege on either schema. App source uses server-side node-postgres/Drizzle rather than Supabase Auth/JS. | All core application records | Confirm infrastructure architecture remains approved |
| Supabase Storage | Bucket `documents` is private; `website-media` is public. The app can also use DB bytea storage and defaults to `STORAGE_PROVIDER=db` unless configured otherwise. | Supporting documents if Storage provider is enabled; public site media in website-media | Confirm which provider/bucket is actually enabled per Vercel environment; legal/vendor review |
| Vercel | Source is designed for Vercel, but the Vercel connection available during this gate returned no accessible team/project, so live project region/log/drain/environment facts were **not verified here**. | Server runtime request data, runtime/build logs, deployment metadata | Verify project/team, runtime regions, log retention/drains, DPA/subprocessor terms |
| SMTP / transactional email | No SMTP/transactional email implementation or provider configuration was found in the reviewed source tree. Current user notifications are application-internal. | None confirmed from source | If email provider is added, record provider, region, message metadata/body handling and DPA before enablement |
| Monitoring / error reporting | No Sentry/third-party observability SDK dependency was found in the current package set reviewed here. Application uses controlled server logging in code. | Runtime error/security metadata | Verify Vercel/Supabase platform logging and any future external monitoring integration |
| Analytics / advertising | No common analytics/advertising SDK dependency found in current package set. | None intentionally collected by an analytics SDK | If enabled later, perform consent/storage/vendor review before Production |

## Supabase access-control note

Supabase database advisors currently report many "RLS enabled, no policy" informational findings in hardening schemas. That finding must be interpreted with the actual architecture: on 2026-10-03, `anon` and `authenticated` had no schema USAGE privilege on `visa_os` or `visa_os_preview`.

Do not automatically add broad Data API policies merely to silence an advisor. Reassess grants/exposed schemas first and preserve the existing server-only database access model unless architecture intentionally changes.

## Evidence not verified in this gate

The following require account/vendor access or contractual documents not available here:
- Vercel live region/environment/log-retention configuration;
- Vercel log drains;
- Supabase contractual DPA/subprocessor/transfer terms accepted by ESSAFARIA;
- backup-retention configuration and contractual guarantees;
- any external corporate mailbox provider outside this repository.

These are handoff items, not assumptions.
