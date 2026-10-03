# ESSAFARIA VISA OS — Production DR Read-Only Evidence — 2026-10-03

Purpose: capture non-sensitive, read-only recovery evidence before the isolated restore drill.

No Production row, schema, object, deployment, secret, account, or configuration was modified while collecting this evidence. No document bytes or applicant identity data were read.

## Platform identity

- Supabase project ref: `xgetzgixalrsmuvfthpf`
- Project status: `ACTIVE_HEALTHY`
- PostgreSQL: 17.6.1.127 / engine 17
- Production application schema: `visa_os`
- Supabase organization plan observed on 2026-10-03: `free`
- Supabase development branches observed: 0

### Provider-backup implication

Current Supabase documentation states that automatic daily backups are provided to Pro, Team and Enterprise projects, while Free projects are advised to export data regularly and keep off-site backups. PITR is available to Pro/Team/Enterprise as an add-on.

Therefore the current Free-plan Production recovery design **must not assume provider daily backups or PITR**. The repository's encrypted `dr:backup` path plus an independent off-site copy is the required baseline until the subscription/recovery service changes.

References:

- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/docs/guides/platform/manage-your-usage/point-in-time-recovery

## Production migration ledger

Observed ledger count: **19**.

First: `0001_init.sql`

Last: `0019_config_translations.sql`

Observed ordered ledger:

1. `0001_init.sql`
2. `0002_branding.sql`
3. `0003_agency_registrations.sql`
4. `0004_phase2_1.sql`
5. `0005_canonical_decision_model.sql`
6. `0006_simplified_status_model.sql`
7. `0007_must_change_password.sql`
8. `0008_application_price_adjustments.sql`
9. `0009_atomic_request_submission.sql`
10. `0010_simplified_applicant.sql`
11. `0011_dzd_only_and_wallet_ref.sql`
12. `0012_document_requests.sql`
13. `0013_embassy_applicability.sql`
14. `0014_wallet_topup_requests.sql`
15. `0015_schema_safe_references.sql`
16. `0016_document_type_audience.sql`
17. `0017_decision_types_audience.sql`
18. `0018_session_presence.sql`
19. `0019_config_translations.sql`

The hardening migrations `0020`–`0024` are not claimed as Production-applied by this evidence.

## Size and critical row-count evidence

Database size observed: **71,011,475 bytes**.

Approximate total relation footprint for `visa_os`: **14,090,240 bytes**.

Critical rows:

| Table | Rows |
| --- | ---: |
| schema_migrations | 19 |
| agencies | 7 |
| users | 6 |
| applications | 2 |
| applicants | 2 |
| documents | 6 |
| document_types | 43 |
| wallet_transactions | 4 |
| audit_logs | 92 |
| site_settings | 19 |
| agency_registration_documents | 0 |
| document_blobs | 13 |

These counts are a dated observation, not an immutable release baseline. Operational data may legitimately change after this capture.

## Wallet integrity evidence

Read-only aggregate checks returned:

| Check | Result |
| --- | ---: |
| Negative agency balances | 0 |
| Non-positive wallet transaction amounts | 0 |
| Before/after arithmetic mismatches | 0 |
| Duplicate wallet human references | 0 |
| Duplicate `APPLICATION_CHARGE` per application | 0 |
| Ledger-chain breaks | 0 |
| Agency balance vs ledger-tail mismatches | 0 |
| Non-zero agency balances without ledger evidence | 0 |
| Processed top-up link failures | 0 |
| Current top-up requests | 0 |

Reference-sequence continuity:

- `wallet_reference_seq.last_value = 4`
- maximum stored wallet reference suffix = 4
- `wallet_topup_reference_seq.last_value = 1`
- maximum stored top-up reference suffix = 0

No sequence was observed behind persisted financial references.

## Final-decision evidence

- Applications currently in APPROVED/REJECTED terminal statuses: **2**
- Terminal decisions missing their corresponding accepted official decision document: **0**

This is metadata/reference evidence only. No official-document bytes were opened.

## Database/blob reconciliation

Observed `document_blobs`:

- total objects: **13**
- total bytes: **4,968,432**
- durable objects: **8**
- durable bytes: **683,544**
- temporary `pending-request/` staging objects: **5**
- temporary staging bytes: **4,284,888**

Durable recognized metadata references:

- reference rows: **8**
- distinct reference keys: **8**
- missing durable objects: **0**
- size mismatches: **0**

The 5 initially "unreferenced" blobs were classified by key family as `pending-request/`, the intentionally temporary pre-submission upload staging mechanism. All five were older than the one-hour staging TTL at the time of this read-only check. They are cleanup debt, not evidence of a lost dossier object. The DR verifier now excludes this ephemeral namespace from durable orphan classification and reports it separately.

No staged blob was deleted during this gate.

## What this evidence proves

At the capture time:

- Production was reachable and the Supabase project reported healthy;
- the Production schema was still at the expected 19-migration state;
- current wallet arithmetic/continuity checks showed no integrity discrepancy;
- terminal decisions had required document metadata/evidence;
- every durable database storage reference resolved to a stored blob with matching size;
- wallet/top-up human-reference sequences were not behind persisted records.

## What this evidence does NOT prove

This file is **not** a backup and is **not** sufficient for DR PASS.

Still required before final DR PASS:

1. create the actual encrypted Production backup artifact using `npm run dr:backup`;
2. copy it to an independent controlled off-site destination;
3. preserve/recover the encryption key separately from the archive;
4. restore the encrypted artifact into a fresh isolated target using `npm run dr:restore`;
5. complete application login/read and tenant-isolation validation against that restored target;
6. record the restore/off-site/application evidence and produce a manifest that evaluates to `VERIFIED`.

Until those external proofs exist, the DR gate remains incomplete even though current live integrity checks are clean.


## Connected provider re-check — 2026-10-03 22:12Z

A second read-only provider inspection was performed through the connected Supabase/Vercel/GitHub integrations.

### Supabase provider facts

- organization: `essafaria travel's projects`
- organization ID: `vercel_icfg_lAKNVL5OfNJRRzKgeAMXr2Ta`
- plan/tier: `free / tier_free`
- Production project: `xgetzgixalrsmuvfthpf`
- project state: `ACTIVE_HEALTHY`
- region: `us-east-1`
- PostgreSQL: `17.6.1.127`
- development branches: **0**
- `pgcrypto`: installed, version **1.3**
- `pg_stat_statements`: installed, version **1.11**

The Supabase management migration history contains platform/project-level records newer than the application's `visa_os.schema_migrations` ledger, including Preview/hardening operations. These records MUST NOT be treated as proof that Production `visa_os` has advanced beyond application migration `0019_config_translations.sql`. The application schema ledger remains the authoritative application-migration evidence.

### Supabase security-advisor observations

The official security advisor currently reports the following findings specifically for `visa_os`:

- WARN: six functions with mutable `search_path`:
  - `generate_wallet_reference`
  - `set_updated_at`
  - `reject_price_adjustment_mutation`
  - `generate_topup_reference`
  - `assign_wallet_reference`
  - `assign_topup_reference`
- INFO: `visa_os.session_presence` has RLS enabled but no policy.

The table-listing API separately returned a critical advisory stating that many `visa_os` tables have RLS disabled and described them as exposed to `anon`/`authenticated`. The official advisor result does not independently reproduce that exact claim for those tables. This discrepancy is intentionally left unresolved in this DR evidence: it belongs to the Security/Release gate and requires Data API exposure/grant verification before pilot/go-live.

Do **not** auto-enable RLS in Production from this DR gate. Enabling RLS without the intended access model/policies can block the application. The hardened branch already contains API-lockdown/RLS work; Production application migration state is still evidenced at `0019`.

### Performance-advisor observations

The performance advisor reports, for `visa_os`:

- 35 foreign keys without a covering index;
- 49 tables without a primary key, dominated by historical `_restore_*` snapshot tables;
- 6 currently unused indexes.

These are not DR-integrity failures. They are performance/cleanup findings and must not be "fixed" by deleting historical restore tables during a DR proof.

## Vercel release-identity evidence

GitHub commit status metadata identifies:

- Vercel team slug: `essafaria-travel-s-projects`
- Vercel team ID returned by the Vercel API error: `team_KlSuy7Z6To4vppiHgR0KhrLK`
- Vercel project name: `newproject`

The current connected Vercel authorization is **not authorized for that team scope** and returns HTTP 403. Therefore no exact Production SHA is claimed from the Vercel connector.

GitHub shows a successful Vercel status for default-branch commit:

`831607a2ed0423d575d693b8f8f3a9dfc1e5d9d1`

with Vercel deployment dashboard reference:

`57Zqe1SS6ArbAy6tH1LGCdKabom4`

This is a **candidate only**, not certified proof that `visa.essafariavoyages.com` currently points to that deployment.

The repository now provides:

`npm run dr:release-resolve`

which uses a read-only `VERCEL_TOKEN` authorized for the ESSAFARIA team, filters READY production deployments, verifies the exact custom-domain alias, and returns the full Git SHA. A 403/missing token is a hard blocker; the candidate above must never be substituted automatically.
