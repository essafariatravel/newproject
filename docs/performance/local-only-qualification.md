# Local performance qualification

All campaigns run on loopback Next.js, an isolated local PostgreSQL instance and local substitutes for external services, using synthetic data. This applies on every hosting plan. Never pass cloud tokens, service-role keys, real session tokens or cloud database URIs to a campaign.

`perf/local-safety.js` is shared by Node entrypoints and both k6 scripts. It rejects remote/ambiguous hosts, URL routing overrides, implicit PG credential files, hosted metadata and cloud credential variables before sessions, credentials or artifacts are read. There is no dotenv loading in performance entrypoints. The original spelling of the target must be canonical `localhost`, `127.0.0.1` or `[::1]`; no numeric aliases, redirects or URL tricks. Direct k6 invocation has the same guard. The previous-tier verifier accepts local evidence only.

Start in a fresh process with an explicit environment allowlist and synthetic database URL, schema, BASE_URL and `PERF_ACK_NONPROD=YES`. Do not reuse the deployed application's environment. Proxy settings, Node preload options and k6 cloud/exporter settings are refused as well. Use only the local `k6 run` launcher with local summary output: never `k6 cloud`, cloud output arguments, cloud extensions or a previously authenticated cloud configuration. A script guard cannot prevent a CLI from uploading an archive before script execution. If practical, run the local stack in an isolated VM/container with no outbound network and all service mocks inside it. This workstation's outbound firewall was not changed; endpoint/credential guards are not proof of OS network isolation.

## Reuse first

Preserve historical query benchmarks and EXPLAIN at 1k/10k/100k dossiers and the 1,000-agency synthetic dataset as comparisons. Record their SHA/schema/machine/dataset identity before comparing. The old 10-VU/811-iteration run had no HTTP errors but an operational STOP verdict. It is not capacity PASS. Neither an old 100-VU result nor registered agency counts proves capacity for the current RC.

No campaign in this consolidation run re-executed those historical benchmarks. The changed storage failure paths, authentic MFA sessions and exact final candidate still need comparable measurements. The current performance session generator creates password-level synthetic sessions and never invents `mfa_verified_at`. A staff route requiring MFA must reject such a session. Complete real local enrollment/challenge or obtain honestly authenticated synthetic sessions through the local application before a multi-role workload; do not disable MFA or stamp its marker to proceed.

## Next campaign

Use 500+ registered synthetic agencies; measure a justified mix of active Agency User/Admin, Visa Agent, Accounting and Super Admin sessions. Include login/challenge separately from preauthenticated navigation. Preserve tenant boundaries; do not reuse one administrator token as all roles.

Run 10, 50, 100 and 250 VU tiers in order only while the prior tier passes, with smaller intermediate tiers where needed. Record p50/p95/p99, requests/s, operation errors, local CPU/RAM, SQL connections/locks/deadlocks, documents throughput, wallet correctness and recovery to baseline. Cover dashboard, search, dossiers, documents, wallet, notifications, communications and reports. Stop at the first critical error or integrity failure. Monitor the whole workload and its cooldown; incomplete monitoring cannot pass.

Every artifact must bind code SHA, dataset/schema hashes, machine/resources, local origins, workload mix, duration and threshold version. Use the existing evaluator's operational budgets, not HTTP error rate alone. No extrapolation of local throughput to Vercel/Supabase capacity. No hosted campaign or massive remote seed is authorized.
