# ESSAFARIA VISA OS — Isolated Capacity Qualification Design

Date: 2026-11-09
Status: Owner selected isolated testing; **billable provisioning and campaign execution remain gated by a separate approved maximum budget**.

## Intent

Measure how many **genuinely active, authenticated** agency and back-office users ESSAFARIA VISA OS can support under a representative workflow. First prove 50 simultaneous users, then seek headroom at 75, 100 and optionally higher. Do not infer capacity from registered accounts, the number of open browser tabs, synthetic database queries alone, or historical local results.

## Selected approach and rejected alternatives

1. **Selected: isolated hosted replica, revised 2026-11-09 with explicit owner approval** — separate Vercel project and a Supabase **development branch** with its own PostgreSQL instance and API credentials (rather than a new top-level Supabase project), matching the Production region and Micro compute. Supabase starts the branch without data. A TEST-only schema and synthetic identities must be used; no changes are merged to the Production parent. This is the approved lower-cost substitution.
2. Local loopback qualification — useful as a no-cost regression/baseline and already supported by the current guarded harness, but cannot establish capacity on Vercel/Supabase.
3. Direct Production load testing — rejected due to risk to live clients, financial transactions and documents.

## Immutable safety boundaries

- Never generate load against `visa.essafariavoyages.com`, current Vercel project `prj_0WOxlorbYiljjjBvZ1Cm6M9JmPdp`, live Supabase project `xgetzgixalrsmuvfthpf`, recovery project refs, or any hostname not individually allowlisted.
- Keep `perf/local-safety.js`, existing local k6 workloads and existing local-only preflight semantics intact. A **separate**, explicitly named isolated-hosted harness is required.
- Pin the **exact** new Vercel project ID, test deployment hostname, Git test branch and **exact** Supabase test-branch project ref in the test-only branch. Use the existing Preview application schema `visa_os_preview` **inside its own isolated branch database** so `src/lib/database-schema.ts` need not be weakened. Refuse wrong Vercel environment, production target, missing metadata, routing overrides, redirects, insecure TLS and ambiguous database URLs. Test-only support must never make Production more permissive.
- Never reuse Production credentials, connection strings, storage buckets, sessions, webhooks, mail providers, payment integrations, cron callbacks or personal data. No PROD copy. Use synthetic documents, accounts, agencies and ledgers. Explicitly disable external outbound effects in TEST.
- Preserve MFA/RBAC/tenant isolation: test genuine authorized sessions, including authentic MFA for staff roles that require it. Never forge `mfa_verified_at`.
- Never use automatic migrations or seeding in Vercel builds. Apply reviewed migrations and controlled synthetic seeds only to verified TEST resources after a separate authorization.
- `BASE_URL`, PostgreSQL URI, session files and output paths must be checked **before** connection, read or load-test process startup. No automatic tier escalation.
- No charge-bearing project, deployment, load-generator service or traffic campaign until the owner agrees to an explicit total spending limit and the calculated worst-case duration/resource sizing. Supabase's compute-hours are not protected by the Spend Cap.

## Evidence already collected

- Production deployment reported READY at commit `15b108ed6366cbd9a291c756fd76ee148868028e` on 2026-11-09. The local clean HEAD `320d0d6b3465e21ac6af3e556d633b22dce0c151` has the exact same Git tree hash (`090badf35e989ed3964cb652b9ed0822bb3b15f8`). Reverify deployed SHA immediately before test setup.
- Supabase organization `essafaria travel's projects` is Pro. Official new-project quote returned by `supabase_get_cost`: **USD 10 recurring monthly** for default project; billed compute is hourly, plus variable usage.
- The hosted database size and Vercel team billing tier are not exposed by the inspected metadata; check before selecting equivalent resources.
- Existing `src/lib/database-config.ts` pins the live Supabase ref for hosted deployments and permits only specified historical isolated-preview refs. `src/lib/database-schema.ts` likewise enforces Preview/Production schema boundaries. New hosted TEST refs will be refused until a specific, safe test-only adaptation exists.
- Existing performance scripts are intentionally loopback-only; do not modify them to accept hosted URLs. The old 10-VU/811-iteration data had an operational STOP verdict, so is not a PASS baseline.
- Local tests `isolated-preview-boundary`, `performance-safety`, `hosted-k6-policy`, `performance-preflight`: **144 passing** on 2026-11-09. No live traffic generated.

## Dataset and workloads

- Create at least 500 synthetic agencies, realistic distributions of applications and history, separate active users for every concurrent VU, and synthetic document bytes. Size the actual dossier count to the Production scale being simulated (record SHA and scale).
- Cover agency browsing/search/applications/documents/notifications, staff queues and communications, accounting/wallet workflows, and one authentically MFA-verified owner where appropriate. Model realistic think time and browser background polling rather than treating every VU as continuous HTTP requests.
- Cover normal reads and bounded synthetic mutations. Verify cross-agency isolation, correct ledger totals, document authorization, idempotency and absence of duplicate application charges.

## Success and stop conditions

- Staged run at 10, 25, 50, 75 and 100 concurrent active users; optional 150/250 only after successful lower tiers and separate cost check. Hold the successful target at least 30 minutes plus cooldown/recovery.
- Global HTTP p95 under 2 seconds; overall failure rate under 1%; operation-specific budgets from `perf/budgets.json` remain applicable. Report p50/p95/p99, requests/s, role and operation error rates.
- **Zero** tenant-crossing data leaks, wallet imbalance, document corruption or unexpected monetary side effects. Any such finding is an immediate STOP.
- Monitor PostgreSQL pool saturation, locks/deadlocks, query time, Vercel function limits, application errors, memory/CPU, and the recovery period. Missing metrics make the result inconclusive, never PASS.
- Archive the tested commit, infrastructure sizes, project IDs, configuration fingerprints (not secrets), synthetic dataset/identities metadata, k6 run files, monitoring window and cleanup proof.

## Financial and cleanup gates

- Quote currently known: Supabase branch USD 0.01344 per billed hour; variable Supabase, Vercel and runner usage remain unquoted. Owner accepted **USD 20 total** before creating TEST resources.
- Obtain production-equivalent sizing and a total owner-approved budget before project creation. Establish a timed run window, spending alert and a named shutdown step. Alerts are not a hard cost cap.
- After evidence is complete, explicitly delete only the uniquely identified TEST resources if the owner has authorized teardown; leave all Production/recovery resources untouched.

