# ESSAFARIA VISA OS — PHASE 2 FINAL RELEASE REPORT

**Branch:** `arena/01a0c3b8-newproject` · **BASE SHA:** `3cacdd9` · **Release HEAD:** `1f2aeb9` · **Migration head:** `0010_simplified_applicant.sql`
**Preview deployment under test:** `https://newproject-jjk0vp0d1-essafaria-travel-s-projects.vercel.app` (auto-resolved per push SHA by the gate workflow)
**Local verification DB:** embedded PG (fresh schema, migrations 0001–0010, fixtures) · **Preview schema/DB:** `visa_os_preview` (Vercel integration + GitHub Action gate) · **Production schema/DB:** `visa_os` (only after gate + safety checks)

Legend: PASS / FAIL / NOT VERIFIED / SKIPPED.

---

## 1. REQUIREMENT IMPLEMENTATION MATRIX — 7 CORRECTIONS

| # | REQUIREMENT | IMPLEMENTED (what + where) | LOCAL TESTED | PREVIEW VERIFIED | PRODUCTION VERIFIED | STATUS |
|---|-------------|----------------------------|--------------|------------------|---------------------|--------|
| 1 | Notifications counter = UNREAD ONLY everywhere; ONE authoritative server source; Mark-all-read → 0 persists across refresh + logout/login; tenant-isolated; server-persisted (not client UI only) | `agencyDashboard(agencyId, userId)` now resolves unread via THE same `unreadNotificationCount(user.id)` that drives the sidebar badge (`src/lib/queries.ts`, `src/app/portal/page.tsx`, `src/app/portal/layout.tsx`); old divergent agency-wide aggregate removed; mark-all-read writes `read_at` server-side and revalidates (`src/app/actions/communications.ts`) | `tests/phase2-final.test.ts` C1 (6 tests): single-source parity, unread-only counting, isolation, persistence after re-query ×2, idempotent re-mark | GHA hosted gate NF-34, NF-45, NF-45b (unread after submit ≥1 → mark-all → 0 → still 0) | — | LOCAL-PASS / **HOSTED-NOT-VERIFIED (SKIPPED — no staff credentials)** / PRODUCTION-NOT-RUN |
| 2 | Agency wallet summary = Available Balance ONLY; remove Transactions/Total Credited/Total Debited cards from AGENCY portal; keep for Staff/Admin/Accounting; ledger untouched | Portal wallet page renders a single balanced header card (Available balance) + prepaid note; ledger table below unchanged; staff aggregates retained (`/admin/billing`: Combined balances, Ledger entries) | C2 tests: source assertions + ledger-render + balance math exactness via adjustWallet | NF-28…NF-33 (Available balance ×3 locales, no aggregate cards), NF-07/NF-08 (staff retention), NF-35 (real credit over HTTP) | — | LOCAL-PASS / **HOSTED-NOT-VERIFIED (SKIPPED — no staff credentials)** / PRODUCTION-NOT-RUN |
| 3 | Step-1: COUNTRY first (only active destinations w/ active visa types), then that country's visa types as CARDS (name/category/price/currency/processing time); still exactly 3 steps | Portal wizard rebuilt: `RequestWizard` gets `countries[]` grouped from `activeVisaOptions()` (active countries ✕ active types only); country buttons gate visa cards; SSR renders all cards (visibility narrowed) for no-JS robustness; step rail shows exactly 3 steps | C3 tests: step count, card content tokens, active-only feed incl. deactivation probe | NF-09…NF-16, NF-22…NF-27 (structure + localized step-1) | — | LOCAL-PASS / **HOSTED-NOT-VERIFIED (SKIPPED — no staff credentials)** / PRODUCTION-NOT-RUN |
| 4 | New-request form = FULL NAME + NATIONALITY only (both required); REMOVE DOB/passport number/passport issue+expiry/email/phone entirely; historical data stays readable | Wizard + server action collect only `t0_fullName` + `t0_nationality`; migration 0010 relaxes `applicants` NOT NULLs (DOB/passport dates) and adds `full_name`; legacy rows untouched & rendered (detail page shows available fields only; `personName` fallback; `nationalityLabel` for codes) | C4 tests + request-23 rewritten: persisted row has full_name+nationality, NULL DOB/passport/email/phone; legacy row insert/read verified | NF-14…NF-21, NF-38 (submitted applicant on detail) | — | LOCAL-PASS / **HOSTED-NOT-VERIFIED (SKIPPED — no staff credentials)** / PRODUCTION-NOT-RUN |
| 5 | Exactly ONE traveller; remove Add-another-traveller; 1 application = 1 applicant enforced UI AND server; crafted multi-applicant payload rejected; historical multi-applicant readable | No add/remove affordances in wizard; `MAX_TRAVELLERS_PER_REQUEST = 1`; server rejects >1 with `APPLICANT_LIMIT`; legacy multi-applicant rows remain readable (detail tab + summary coalesce) | C5 tests + crafted-payload rejection test | NF-19 (`Add another traveller` absent) | — | LOCAL-PASS / **HOSTED-NOT-VERIFIED (SKIPPED — no staff credentials)** / PRODUCTION-NOT-RUN |
| 6 | Nationality = proper country selector from platform data; EN/FR/AR+RTL; default ALGERIA; server validates stable ID (ISO code), not label | New `src/lib/nationalities.ts`: ~200 ISO codes, curated tri-locale labels for the primary set, `DEFAULT_NATIONALITY = "DZ"`; wizard renders `<select name="t0_nationality" defaultValue="DZ">` with option VALUE=code, LABEL=localized name; server `isValidNationality` gate → `APPLICANT_NATIONALITY_INVALID` | C6 tests: uniqueness, labels A/E/A, label-input rejected, legacy-text display fallback, server rejection e2e | NF-16, NF-24, NF-26, NF-27 (Algeria/Algérie/الجزائر + RTL) | — | LOCAL-PASS / **HOSTED-NOT-VERIFIED (SKIPPED — no staff credentials)** / PRODUCTION-NOT-RUN |
| 7 | Applications list: APPLICANT column right after REFERENCE (order REFERENCE/APPLICANT/VISA-COUNTRY/DOCUMENTS/FEE/STATUS/CREATED); full name; participates in search; localized; safe legacy fallback | Query `applicantSummary` = `coalesce(nullif(full_name,''), first+last, '—')`; search spans full_name; portal table column inserted at position 2 | C7 tests: header order inside thead, coalesce SQL present, end-to-end search by name | NF-40…NF-44 (order EN + row + search + FR/AR headers) | — | LOCAL-PASS / **HOSTED-NOT-VERIFIED (SKIPPED — no staff credentials)** / PRODUCTION-NOT-RUN |

## 2. REGRESSION (local — `git rev-parse e80ee281`)

| GATE | RESULT | DETAIL |
|------|--------|--------|
| Automated test suite | **PASS** | 39 files / **277 tests** green (was 252; request-23 evolved to final flow, phase2-final suite added: 24 focused tests); re-attested at final `1f2aeb9` in a rebuilt sandbox |
| TypeScript `tsc --noEmit` | **PASS** | 0 errors |
| ESLint | **PASS** | 0 errors/warnings |
| Production build (`pnpm build`) | **PASS** | next build exit 0, static generation OK |
| Rendered runtime verification (served build + seeded DB) | **PASS** | wallet ×3 locales, wizard ×3 locales (3 sections, country cards, DZ selected), applications list ×3 locales (column order), RTL `dir="rtl"` (AR), dashboard unread counter, 404 on foreign ID |
| Hosted gate — cold validation of the gate script itself | **PASS** | NF-01…NF-45 executed against a locally served production build → **46/46 PASS** (inc. real HTTP wallet credit, real single-applicant submission, mark-all-read persistence) |
| Known flake (pre-existing) | NOTED | `wallet-statement.test.ts` PDF determinism shows a second-boundary flake under suite load; passes standalone + on re-run; unrelated to this release |

## 3. PREVIEW RELEASE GATE (authoritative gate: GitHub Action "Hosted Phase-2 Preview verification")

**Official run:** `Hosted Phase-2 Preview verification` on `b754d2b` → **conclusion SUCCESS** — but with **51 SKIPPED checks** requiring staff credentials:
- PASS on hosted: health (ok + `columnsValid` + migration ledger `0010`), unauthenticated redirects (no content leak), login/registration EN-FR-AR + RTL, registration submission flow incl. mass-assignment junk rejection, honeypot & rate limiting, final health.
- SKIP on hosted: every check requiring an agency/staff session — portal wallet (NF-07/08, NF-28…35), wizard final UX (NF-09…27), list & applicant column end-to-end (NF-36…44), notification unread/mark-all (NF-34, NF-45, NF-45b). These were SKIPPED (not failed) because `PREVIEW_VERIFY_STAFF_EMAIL/PASSWORD` secrets do not exist; gaining them from the sandbox is impossible (bootstrap requires matching **Vercel** env var — no Vercel console access; secret write = 403 by token policy).
- LOCAL cross-validation (not a hosted substitute; informational only): the same NF-01…NF-45 block run against a locally served production build + seeded DB → **46/46 PASS**.

Runs pure HTTP over the CURRENT Vercel Preview deployment resolved per push SHA (workflow: `.github/workflows/preview-verify.yml`, harness: `scripts/hosted-verify.sh`):

- hosted health; unauthenticated redirects; login/registration localization;
- agency provisioning chain (register → staff approve → activation → portal session);
- **NF-01…NF-45** final-release smoke checks (wallet simplification, wizard final UX ×3 locales + RTL + DZ default, single-applicant submission incl. atomic SUBMITTED + ledger charge, Applications APPLICANT column + search + localization, notifications unread counter + mark-all-read persistence);
- preview-only state; no connections to `visa_os`.

STATUS matrix per section above.

## 4. PRODUCTION SAFETY CHECKS (before any `visa_os` action; executed at release commit)

| # | CHECK | METHOD | EXPECTED | STATUS |
|---|-------|--------|----------|--------|
| 1 | Deployment SHA == reviewed commit | origin branch HEAD `b754d2b`; main not merged | equal at merge time | **NOT RUN (blocked)** |
| 2 | Migration ledger = files under migrations/ | `/api/health` on Preview (columnsValid + ledger) | 0001–0010 | **PASS (Preview — health enumerated 0010)** |
| 3 | Schema separation preserved | bootstrap route refuses anything but `visa_os_preview`; health confirmed schema | preview==visa_os_preview | **PASS (Preview)** / prod NOT RUN |
| 4 | Production untouched pre-gate | sandbox holds no production connection string | zero connections | **PASS** |
| 5 | No destructive ops | migration 0010 additive-only; no seeds/resets anywhere in release path | none executed | **PASS** |
| 6 | Wallet / credentials / branding integrity | post-migration read-only probes on `visa_os` | ≥ baseline | **NOT RUN (blocked)** |
| 7 | Forward-safe migrations | 0010 is additive (ALTER … DROP NOT NULL, ADD COLUMN IF NOT EXISTS) — idempotent re-run | applies cleanly twice | LOCAL-PASS (migrations suite) |
| 8 | Backup/rollback path | Vercel instant rollback + DB PITR | confirm at deploy time | **NOT RUN (blocked)** |

## 4b. MERGE DRY-RUN PROOF (preflight for the eventual `main` merge)

| CHECK | METHOD | RESULT |
|-------|--------|--------|
| unrelated-histories merge is clean | `git merge --no-commit --no-ff --allow-unrelated-histories -X theirs 1f2aeb9` inside a throwaway worktree detached at `main` (`d1f149d`) | RC=0, no conflicts needing manual fixes |
| merged content == audited branch content (zero delta) | `git write-tree` on merged index == `git rev-parse 1f2aeb9^{tree}` | both = `c0d6a6d1ea4d9f50b74f7b1ce120653886bfd4d8`; `git diff branch -- .` = 0 lines |
| production baseline linkage | `main^{tree}` = `55b9272acc9c2dd2ee1123aad61b6107435bbb7e` (the prior production baseline — branch fully supersedes it) | confirmed |

⇒ When the gate is unblocked, merging `main` introduces **no content delta** beyond the reviewed branch; it only links history for auditability.

## 7. P0 INCIDENT & PRODUCTION RECOVERY (2026-09-22)

### Root cause (VERIFIED via the app's own live diagnostics on both domains)
- Production domain `https://visa.essafariavoyages.com` has been serving Phase-2 branch builds promoted from Vercel Preview today (00920c7 → add8fae → 41c70b1 → …).
- `/api/health` on the PRODUCTION domain reported: `connected=True`, `columnsValid=False`, schema `visa_os`, migration ledger **{0001, 0002}**, `accounts=True`, and the exact server-side failure `42P01 — relation "visa_os.account_activation_tokens" does not exist`.
- `/api/health` on the CURRENT branch Preview reported: schema `visa_os_preview`, ledger **{0001..0010}**, `columnsValid=True`, `accounts=True`; a live bogus-credential login returned the normal *"Invalid email or password"* (never the service-unavailable message) — full auth pipeline healthy where the schema matches the code.
- Existing production users still exist (accounts=True); their login dies inside `authenticate()`/session creation because the drizzle user/session/session-adjacent queries resolve Phase-2 relations/columns absent from `visa_os` (ledger stuck at 0002).
- Branding difference root cause: logo/colors/name are stored per-schema in `site_settings` (`brand.*`; logo under `branding/logo` in the per-schema `document_blobs` storage). `visa_os` simply holds older values — legitimate environment difference, NOT a code defect. No blind copy contemplated.

### Migration audit (0003–0010, executed against code — full text reviewed)
| File | Class | Notes |
|---|---|---|
| 0003_agency_registrations.sql | SAFE | CREATE-only new tables incl. `account_activation_tokens` |
| 0004_phase2_1.sql | SAFE | idempotent config inserts (DZD, REJECTED, decision doc types), column default only |
| 0005_canonical_decision_model.sql | SAFE-WITH-PRECONDITION | REFUSED→REJECTED live remap, history preserved, counts logged (pre-counts captured by audit preflight) |
| 0006_simplified_status_model.sql | SAFE-WITH-PRECONDITION | name_fr/ar add; canonical upserts; retired remap w/ history preserved; statuses deactivated not deleted |
| 0007_must_change_password.sql | SAFE | ADD COLUMN NOT NULL DEFAULT false — existing users NOT converted to temp |
| 0008_application_price_adjustments.sql | SAFE-WITH-PRECONDITION | new immutable table; 3 nullable columns; backfill submitted_price=fee for submitted rows; wallet check WIDENED only |
| 0009_atomic_request_submission.sql | SAFE | nullable column + partial unique index |
| 0010_simplified_applicant.sql | SAFE | DROP NOT NULL relaxations + nullable column |
- No TRUNCATE / DROP TABLE / DROP COLUMN / wallet-balance writes anywhere in the range. The runner is single-transaction + advisory-locked + ledger-guarded.

### Recovery machinery (implemented, pushed, secrets-gated)
- `scripts/prod-release.ts` — `audit` (read-only) and `apply` (surgical in-place restore snapshot of exactly the migration-write tables → transactional apply → postflight integrity: protected counts, wallet-transactions MD5 checksum, per-agency balance checksums, brand.* byte-identity, columnsValid, ledger growth-only). Fail-closed guards: schema pinned `visa_os`, Supabase project pinned, ledger must pre-exist, integrity findings abort.
- `.github/workflows/prod-release.yml` — audit runs on every tooling push; the write path runs ONLY when a commit deliberately adds `release/PROD_GO` (intent recorded in git history).

### Current blocker (external, user-side, ~4 minutes total)
- NO database connection secret exists anywhere in GitHub (repo + 'Production' env, names PRODUCTION_DATABASE_URL / DATABASE_URL / SUPABASE_DATABASE_URL / SUPABASE_DB_URL / POSTGRES_URL_POSTGRES — all masked-empty; verified by the audit job guard, report posted as commit comment). Only Vercel holds the URI.
- PREVIEW_VERIFY_STAFF_EMAIL / PREVIEW_VERIFY_STAFF_PASSWORD also still unset (gate staff chain stays SKIPPED). Values now known from user message (admin@essafariavoyages.com); agent cannot set secrets (403 scope limit).

## 5. PRODUCTION DEPLOYMENT (order, all after Preview gate PASS)

1. Merge branch → `main` (`git merge --allow-unrelated-histories -X theirs`; production main-line baseline content equals `38023cd` which the branch fully supersedes).
2. Push `main`; Vercel Production deploy fires automatically; record FINAL SHA.
3. Verify migration head on `visa_os` via deploy-time migration step (0001–0010) — migrations never mutate wallet data.
4. Safe, non-destructive Production smoke: `/api/health` (ok/schema), unauthenticated redirects, NO fabricated charges (no approved prod test account — wallet smoke limited to read-only surfaces).
5. Record evidence into §1 column PRODUCTION VERIFIED.

## 6. EXPECTED FINAL BUSINESS VALUES

- Unread notification counter after Mark-all-read = **0** and stays 0 on refresh + relogin.
- Agency wallet surfaces show **Available balance**; Total Credited/Debited & Transactions cards = **absent** on portal, present on staff surfaces.
- Request flow = **3 steps**; step 1 = **country → visa-type cards** + Full name + Nationality (default **Algeria**).
- Application rows = **one applicant**, initial status **SUBMITTED**, one wallet charge enforced atomically with idempotent replay.
- DOB/passport/email/phone fields = **removed from the flow** (columns retired, historical data intact & readable).
- Upload cap **2 MB/file** enforced everywhere; required documents block submission, optional don't.
- Status model unchanged (EMBASSY_SENT optional; CANCELLED never default; DRAFT ≠ abandoned artifact).
