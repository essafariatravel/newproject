# ESSAFARIA VISA OS — PHASE 2 FINAL RELEASE REPORT

**Branch:** `arena/01a0c3b8-newproject` · **BASE SHA:** `3cacdd9` · **Migration head:** `0010_simplified_applicant.sql`
**Local verification DB:** embedded PG (fresh schema, migrations 0001–0010, fixtures) · **Preview schema/DB:** `visa_os_preview` (Vercel integration + GitHub Action gate) · **Production schema/DB:** `visa_os` (only after gate + safety checks)

Legend: PASS / FAIL / NOT VERIFIED / SKIPPED.

---

## 1. REQUIREMENT IMPLEMENTATION MATRIX — 7 CORRECTIONS

| # | REQUIREMENT | IMPLEMENTED (what + where) | LOCAL TESTED | PREVIEW VERIFIED | PRODUCTION VERIFIED | STATUS |
|---|-------------|----------------------------|--------------|------------------|---------------------|--------|
| 1 | Notifications counter = UNREAD ONLY everywhere; ONE authoritative server source; Mark-all-read → 0 persists across refresh + logout/login; tenant-isolated; server-persisted (not client UI only) | `agencyDashboard(agencyId, userId)` now resolves unread via THE same `unreadNotificationCount(user.id)` that drives the sidebar badge (`src/lib/queries.ts`, `src/app/portal/page.tsx`, `src/app/portal/layout.tsx`); old divergent agency-wide aggregate removed; mark-all-read writes `read_at` server-side and revalidates (`src/app/actions/communications.ts`) | `tests/phase2-final.test.ts` C1 (6 tests): single-source parity, unread-only counting, isolation, persistence after re-query ×2, idempotent re-mark | GHA hosted gate NF-34, NF-45, NF-45b (unread after submit ≥1 → mark-all → 0 → still 0) | — | PENDING-GATE |
| 2 | Agency wallet summary = Available Balance ONLY; remove Transactions/Total Credited/Total Debited cards from AGENCY portal; keep for Staff/Admin/Accounting; ledger untouched | Portal wallet page renders a single balanced header card (Available balance) + prepaid note; ledger table below unchanged; staff aggregates retained (`/admin/billing`: Combined balances, Ledger entries) | C2 tests: source assertions + ledger-render + balance math exactness via adjustWallet | NF-28…NF-33 (Available balance ×3 locales, no aggregate cards), NF-07/NF-08 (staff retention), NF-35 (real credit over HTTP) | — | PENDING-GATE |
| 3 | Step-1: COUNTRY first (only active destinations w/ active visa types), then that country's visa types as CARDS (name/category/price/currency/processing time); still exactly 3 steps | Portal wizard rebuilt: `RequestWizard` gets `countries[]` grouped from `activeVisaOptions()` (active countries ✕ active types only); country buttons gate visa cards; SSR renders all cards (visibility narrowed) for no-JS robustness; step rail shows exactly 3 steps | C3 tests: step count, card content tokens, active-only feed incl. deactivation probe | NF-09…NF-16, NF-22…NF-27 (structure + localized step-1) | — | PENDING-GATE |
| 4 | New-request form = FULL NAME + NATIONALITY only (both required); REMOVE DOB/passport number/passport issue+expiry/email/phone entirely; historical data stays readable | Wizard + server action collect only `t0_fullName` + `t0_nationality`; migration 0010 relaxes `applicants` NOT NULLs (DOB/passport dates) and adds `full_name`; legacy rows untouched & rendered (detail page shows available fields only; `personName` fallback; `nationalityLabel` for codes) | C4 tests + request-23 rewritten: persisted row has full_name+nationality, NULL DOB/passport/email/phone; legacy row insert/read verified | NF-14…NF-21, NF-38 (submitted applicant on detail) | — | PENDING-GATE |
| 5 | Exactly ONE traveller; remove Add-another-traveller; 1 application = 1 applicant enforced UI AND server; crafted multi-applicant payload rejected; historical multi-applicant readable | No add/remove affordances in wizard; `MAX_TRAVELLERS_PER_REQUEST = 1`; server rejects >1 with `APPLICANT_LIMIT`; legacy multi-applicant rows remain readable (detail tab + summary coalesce) | C5 tests + crafted-payload rejection test | NF-19 (`Add another traveller` absent) | — | PENDING-GATE |
| 6 | Nationality = proper country selector from platform data; EN/FR/AR+RTL; default ALGERIA; server validates stable ID (ISO code), not label | New `src/lib/nationalities.ts`: ~200 ISO codes, curated tri-locale labels for the primary set, `DEFAULT_NATIONALITY = "DZ"`; wizard renders `<select name="t0_nationality" defaultValue="DZ">` with option VALUE=code, LABEL=localized name; server `isValidNationality` gate → `APPLICANT_NATIONALITY_INVALID` | C6 tests: uniqueness, labels A/E/A, label-input rejected, legacy-text display fallback, server rejection e2e | NF-16, NF-24, NF-26, NF-27 (Algeria/Algérie/الجزائر + RTL) | — | PENDING-GATE |
| 7 | Applications list: APPLICANT column right after REFERENCE (order REFERENCE/APPLICANT/VISA-COUNTRY/DOCUMENTS/FEE/STATUS/CREATED); full name; participates in search; localized; safe legacy fallback | Query `applicantSummary` = `coalesce(nullif(full_name,''), first+last, '—')`; search spans full_name; portal table column inserted at position 2 | C7 tests: header order inside thead, coalesce SQL present, end-to-end search by name | NF-40…NF-44 (order EN + row + search + FR/AR headers) | — | PENDING-GATE |

## 2. REGRESSION (local — `git rev-parse e80ee281`)

| GATE | RESULT | DETAIL |
|------|--------|--------|
| Automated test suite | **PASS** | 39 files / **277 tests** green (was 252; request-23 evolved to final flow, phase2-final suite added: 24 focused tests) |
| TypeScript `tsc --noEmit` | **PASS** | 0 errors |
| ESLint | **PASS** | 0 errors/warnings |
| Production build (`pnpm build`) | **PASS** | next build exit 0, static generation OK |
| Rendered runtime verification (served build + seeded DB) | **PASS** | wallet ×3 locales, wizard ×3 locales (3 sections, country cards, DZ selected), applications list ×3 locales (column order), RTL `dir="rtl"` (AR), dashboard unread counter, 404 on foreign ID |
| Hosted gate — cold validation of the gate script itself | **PASS** | NF-01…NF-45 executed against a locally served production build → **46/46 PASS** (inc. real HTTP wallet credit, real single-applicant submission, mark-all-read persistence) |
| Known flake (pre-existing) | NOTED | `wallet-statement.test.ts` PDF determinism shows a second-boundary flake under suite load; passes standalone + on re-run; unrelated to this release |

## 3. PREVIEW RELEASE GATE (authoritative gate: GitHub Action "Hosted Phase-2 Preview verification")

Runs pure HTTP over the CURRENT Vercel Preview deployment resolved per push SHA (workflow: `.github/workflows/preview-verify.yml`, harness: `scripts/hosted-verify.sh`):

- hosted health; unauthenticated redirects; login/registration localization;
- agency provisioning chain (register → staff approve → activation → portal session);
- **NF-01…NF-45** final-release smoke checks (wallet simplification, wizard final UX ×3 locales + RTL + DZ default, single-applicant submission incl. atomic SUBMITTED + ledger charge, Applications APPLICANT column + search + localization, notifications unread counter + mark-all-read persistence);
- preview-only state; no connections to `visa_os`.

STATUS: PENDING-RUN (GitHub credential rotation blocked the push; run autostarts on push since the workflow + script changed).

## 4. PRODUCTION SAFETY CHECKS (before any `visa_os` action; executed at release commit)

| # | CHECK | METHOD | EXPECTED | STATUS |
|---|-------|--------|----------|--------|
| 1 | Deployment SHA == reviewed commit | `git rev-parse origin/arena/01a0c3b8-newproject` == merged `main` HEAD | equal | PENDING |
| 2 | Migration ledger = files under migrations/ | `/api/health` on Preview (`columnsValid`+schema) vs `public/schema_migrations` | ledger lists 0001–0010 | PENDING |
| 3 | Schema separation preserved | `DATABASE_URL` mapped per environment (Vercel env Preview↔Production); NO cross-connection strings in repo | preview==visa_os_preview, prod==visa_os | PENDING |
| 4 | Production untouched pre-gate | no `pg` connections opened against `visa_os` during verification | zero | PENDING |
| 5 | No destructive ops | grep release steps: no reset/truncate/seed/copy of test data | none executed | PENDING |
| 6 | Wallet / credentials / branding integrity | post-migration probe: `agencies.balance`, users count ≤ pre-release baseline, branding settings row count unchanged | ≥ baseline, equal counts | PENDING |
| 7 | Forward-safe migrations | 0010 is additive (ALTER … DROP NOT NULL, ADD COLUMN IF NOT EXISTS) — idempotent re-run | applies cleanly twice | LOCAL-PASS (migrations suite) |
| 8 | Backup/rollback path | Vercel instant rollback to previous production deployment + DB point-in-time (Neon/managed PG) | available before deploy | PENDING |

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
