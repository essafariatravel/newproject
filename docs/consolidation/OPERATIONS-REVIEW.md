# Candidate operations review

Production execution is excluded. These are engineering proposals, not contractual SLAs or permission to deploy.

## Proposed SLOs

Measure over rolling 30 days, separately by environment and release. Exclude only explicitly recorded maintenance; retain provider failures in the user-facing denominator.

| Signal | Proposed objective | Measurement / response |
| --- | --- | --- |
| Availability | 99.9% successful critical-route probes | Authenticated synthetic probe and public readiness; alert after two consecutive failed probes. |
| HTTP failures | Under 0.1% unexpected 5xx | Structured route results; exclude expected authorization/validation rejection. |
| Critical reads | Existing `perf/budgets.json` operation p95/p99 | Applications p95 700 ms; wallet 600 ms; dashboard 800 ms. Never raise budgets to hide a failure. |
| Database readiness | 99.9% ready probes | Protected readiness probe; alert on timeout/unavailable pool. |
| Upload success | At least 99.5% of valid authorized attempts | Completed immutable blob plus metadata; invalid/oversized/rejected files tracked separately. |
| Email acceptance | At least 99% configured eligible attempts | Provider rejection, timeout and malformed confirmation are failures; API acceptance is not delivery. Delivery requires Brevo events/account verification. |
| Wallet integrity | Zero unexplained reconciliation differences | Read-only balance/ledger and top-up reconciliation; page on any difference; never auto-repair Production. |

Correlate safe request/release identifiers with route/DB latency and error codes. Do not record passport/document content, tokens, passwords or MFA secrets. Existing in-portal notifications remain durable when optional email delivery fails.

## Credential rotation preparation

Read-only metadata inspected on 2026-10-07:

- Vercel project `newproject`: sensitive `DATABASE_URL` is shared by Production and Preview. `newpro_POSTGRES_DATABASE` is also scoped to both; inspect the linked integration before rotation rather than assuming it is another password.
- GitHub repository: `PERF_PREVIEW_DATABASE_URL`; Preview environment: `PREVIEW_DATABASE_URL`; Production environment: `PRODUCTION_DATABASE_URL`.
- DR source backup depends on the Production environment connection; recovery restore requires its own recovery-project connection.
- Local secret files and external owner-managed integrations are not proven exhaustive by repository metadata. Inventory them privately, without pasting values into issues/logs.

Controlled owner-authorized sequence: record provider/project identity and current connection consumers; prepare secret-store updates and rollback access; rotate the compromised database credential in Supabase; update every affected Vercel/GitHub environment and operator secret store; redeploy only explicitly approved environments; verify connection readiness and protected diagnostics; run approved smoke/reconciliation checks; invalidate/remove old copies and document completion. Do not revoke before all consumers and recovery access are prepared. This candidate task does not rotate Production credentials.

## Candidate migrations and first privileged enrollment

`0032_privileged_mfa.sql` and `0033_rule_provenance_and_bounded_history.sql` are additional candidate migrations. The authorized Production pending set remains exactly 0020–0031. Production preflight must reject 0032/0033 until separately reviewed and approved; no `PROD_GO` is created.

Create a dedicated random 32-byte MFA encryption key in the environment's secret store. Keep it with the encrypted database backup in a separate protected recovery store; losing it prevents TOTP recovery. First privileged enrollment requires an independently verified SUPER_ADMIN identity and an expiring user-bound authorization. `scripts/mfa-authorize-local.ts` is restricted to non-Production bootstrap; it is not a Production bypass. Once enrolled, a verified SUPER_ADMIN can issue a single-use authorization to another Staff account through the security center. Recovery codes are shown once, hashed at rest, consumed atomically and invalidate existing access on use. Reset requires a different verified SUPER_ADMIN, password confirmation and an audit reason.

## External decisions

Public DNS was checked read-only on 2026-10-08 at 08:28:24 UTC. `essafariavoyages.com` publishes SPF (`include:_spf.google.com include:sendersrv.com ~all`) and a DMARC monitoring record (`p=none`). These records already exist; they must not be reported as absent. They do not prove Brevo sender authorization, DKIM or delivery. Confirm the actual verified sender domain and Brevo-provided DKIM selector in the authenticated account before preparing exact DNS changes. Do not replace existing sender includes or tighten DMARC without checking all legitimate senders. No DNS changes were made.

- Malware scanning/CDR: select a provider and policy after reviewing upload controls; do not claim file signatures detect malware.
- Legal: counsel/owner must approve EN/FR/AR Privacy and Terms, effective/publication dates, version and reacceptance scope. Contact is `info@essafariavoyages.com`; do not publish draft text.
- Email: owner supplies Brevo API key through the secret store, verifies sender, and configures SPF/DKIM/DMARC using the provider's actual account instructions. [Brevo response contract](https://developers.brevo.com/docs/send-a-transactional-email).
- Independent pentest: commission a third party; internal tests and code review are not an independent pentest.

## Release and rollback preparation

Owner review must cover exact candidate SHA, CI, isolated Preview runtime, proven load tier, additive migrations, legal and operational gates. Preserve an encrypted, verified backup and immutable previous deployment before any separately authorized Production change. After approval, use explicit migrations and exact-SHA deployment, then health/auth/upload/submit/wallet/notification/Staff smoke checks and read-only reconciliation. On runtime failure, roll back the deployment to the verified previous SHA; additive MFA/rule-history schema does not justify destructive down-migration. Do not claim a pilot capacity above the measured passing tier.

## Recovery evidence and retention

The 2026-10-07 real drill restored an encrypted read-only Production backup into the existing recovery project `vwixmkzgpmzgwbshzxji`. Backup run `37650796497` completed successfully. The restored 19-entry migration ledger, wallet invariants and all 13 blob hashes matched the captured source; the actual Production application revision `831607a2ed0423d575d693b8f8f3a9dfc1e5d9d1` started against recovery and passed seven runtime and six tenant-isolation checks. The temporary restore role was disabled and its temporary credential-delivery schema removed after verification. Production was not restored into or changed.

The encrypted archive has a separately downloaded and verified GitHub Actions copy, artifact `11495503884`, with SHA-256 `2b3250d96693aae0c349aa8c2beb6618c89e5e3b7fa1a05a2b73dda7bd47ca11`. That copy expires on **2026-10-10 at 16:17:35 UTC**. It proves an independent copy for this drill, not durable operational retention. The local decryption material is protected with Windows DPAPI for the current user; a different machine or operator cannot be assumed to recover it. The owner must select durable encrypted retention and independently recoverable key escrow before relying on the procedure operationally.

Capture-to-final-verification took approximately 43 minutes 27 seconds, including first-time provisioning, build and diagnosis. This is drill elapsed time, not a measured incident RTO. Scheduled backup frequency, PITR entitlement and an operational RPO remain separate owner/provider decisions. Preserve the verified manifest and private aggregate evidence without publishing backup contents or keys.

## Capacity qualification policy

Run authenticated tiers in order: 10, 50, 100, 250, 500 and 1,000 VUs, each with the existing representative workload and a 20-minute hold. A passing preceding tier must match the exact SHA and Preview URL, contain all five evidence files, and include DB samples spanning the complete workload. Older runs without this complete monitoring must not authorize escalation.

The optional spike uses the existing 50-to-250-to-10 profile and requires a proven stable 250-VU tier. The optional soak uses the same representative workload at a previously proven 100 or 250 VUs for two hours. Neither profile substitutes for ordered stable tiers. Do not overlap portal and public load runs against shared database infrastructure or infer untested capacity from a passing lower tier.
