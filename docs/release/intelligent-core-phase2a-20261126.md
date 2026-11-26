# Intelligent Core 1.0 — Phase II-A
Baseline: 9528e0bfbfb16e8a5e7877abdd70248ab9b7e428, Vercel dashboard deployment 3Jv5KNXBY89MqJDVkyvQPA3UUnHL shown Ready, Production, Current, visa.essafariavoyages.com.
Branch: codex/phase2a-intelligent-core-20261126. No production promotion, DB migrations, seed, new dependencies or paid resources.
## Changes
- Remove 110 identical route-dependent header declarations across six views. Preserve the stable layout selectors and page-specific styles.
- Share page authentication lookup through React request/render cache only; server actions and API authorization keep their existing uncached path. Do not cache tenant information globally.
- Parallelize independent locale/preferences reads; use a Map to group visa destinations. No changes to booking rules, ledger, upload storage, or transaction lock.
- Add opt-in server read timings (ESSAFARIA_CORE_TIMING=true). Logs contain fixed operation names, rounded elapsed time and success only, no personal data. Disabled by default.
- Preview-only two-file staging queue; drains started work after an error, preserves token order and the existing idempotency key. Sequential fallback via ESSAFARIA_PARALLEL_STAGING=false. Production default remains sequential until qualification.
- Preview-only notification coordination: Web Locks and ephemeral BroadcastChannel per hashed session/user/tenant/role/credential/locale/finance scope; three-second max reuse, server auth probe before using peer feed, independent fallback; no persistent feed cache. ESSAFARIA_NOTIFICATION_SHARING=false disables coordination. Staff remains unchanged. Do not treat this namespace as a credential.
## Visa Intelligence next
Define reviewed, versioned programme rules and tri-state results (compatible, incompatible, manual review). No inference of a visa decision. No schema change or rule deployment in Phase II-A.
## Qualification
Build and test status must be recorded against the exact SHA. Pure/simulated tests do not replace concurrent PostgreSQL tests, authenticated browser E2E, visual RTL/mobile checks or actual p95 measurements. Keep experimental features off in Production until these gates pass. Do not perform hosted database writes or load testing without separate authorization.
