# ESSAFARIA VISA OS — Requirement Completion Matrix

Scope: master directive (73 sections), staff back-office + agency portal + public site.
Base: production release `3a1cdc9` (untouched). Work branch: `arena/01a0ce58-newproject`
(head `ae51ebd`, all work preview-first, **no production operation performed**).

Evidence legend

| Mark | Meaning |
| --- | --- |
| ✅ | Implemented **and** verified with a named artefact (test file / rendered-audit check / gate section / log). |
| 🟡 | Implemented, verified structural/unit/server-side only — **no pixel rendering in a real browser** (sandbox has no working browser). Classified, never reported as a visual PASS. |
| ⛔ | Blocked by a genuine external dependency (missing deployment credential) — documented, not silently skipped. |
| 🚫 | Explicitly out of scope by instruction (production execution). |

Verification snapshot at `ae51ebd`:

* `npx tsc --noEmit` clean · `npm run lint` clean
* `npx vitest run` → **52 files / 412 tests passed** (`/tmp/vitest-run23.log`)
* `npm run build` → **exit 0** (`/tmp/build18.log`)
* `node scripts/rendered-audit.mjs` (real server on :3100) → **542 passed · 0 failed · 2 classified** (`/tmp/audit29.log`)
* `npx tsx scripts/pre-prod-gate.ts` against `visa_os_preview` → **ALL GATES PASSED** (34 sections, `/tmp/gate-local21.log`)
* `npx tsx scripts/rendered-state.ts` → rendered-state fixtures rewritten (`/tmp/state12.log`)

Hosted Preview (real Vercel deployment + the Preview database), verified by CI on commit `6adf570`:

* `Pre-Production Gate — DB Security & Concurrency` run **35988387317** → **success**, verdict comment = **35 PASS / 0 FAIL**, gate exit 0
  (Preview ledger `visa_os_preview` = 17 migrations incl. `0015`/`0016`/`0017`; Production ledger `visa_os` = through `0012` — untouched)
* `Hosted Phase-2 Preview verification` run **35988387360** → **success**, verdict comment = **119 PASS / 0 FAIL / 1 SKIP**
  (the single SKIP is the production *real-login* smoke, which intentionally requires dedicated production credentials and keeps production read-only)

---

## 1. P0 — Security, tenancy, financial integrity

| # | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| 1.1 | RBAC enforced **server-side** on every action and route | ✅ | `tests/rbac.test.ts` (11); `getSessionUser` + explicit 401/403 in both export routes (route handlers never `requireUser`) |
| 1.2 | Tenant isolation: cross-tenant read/mutate/document/wallet/messages/exports impossible | ✅ | `tests/tenant-isolation.test.ts` (11); audit checks `state: staff session cannot use the agency wallet export`, agency export `403` on foreign scope; `docs`/`messages`/`wallet` queries always take `agencyId` from the session |
| 1.3 | Staff operate with `agency_id = NULL` | ✅ | `tests/rbac.test.ts`; staff pages resolve `pageUser()` without agency scope; `tests/ops-views-31.test.ts` (9) |
| 1.4 | Wallet atomic + idempotent — submission debits **exactly once**, never negative | ✅ | `tests/concurrency.test.ts`; `tests/wallet.test.ts`; `tests/submission.test.ts` (parallel submits yield one charge, second attempt rejected); `tests/phase2-final.test.ts` (24) |
| 1.5 | Wallet mutation limited to SUPER_ADMIN / ADMIN / ACCOUNTING; VISA_AGENT view-only | ✅ | `tests/rbac.test.ts`; `tests/ops-views-31.test.ts`; server action guards in `src/app/actions/wallet.ts` |
| 1.6 | DZD end-to-end (prices, charges, ledger, statements, exports, reports) — no EUR/USD presentation | ✅ | `tests/dzd-currency.test.ts`; audit checks on `/admin/reports`, wallet ledger, visa-type editor (`no €/EUR/USD`); `tests/config-editor-39.test.ts` currency guard |
| 1.7 | Required documents enforced server-side (agency cannot submit without them) | ✅ | `tests/submission-gate-22.test.ts`; `tests/document-workflow-33.test.ts` (18) |
| 1.8 | Post-submit locking; only explicit staff request reopens a slot; v1/v2 never overwritten | ✅ | `tests/document-workflow-33.test.ts`; `tests/staff-doc-review-23.test.ts`; rendered state `lockedUploadBlocked: true` |
| 1.9 | Replacement opens only its own slot; additional docs only from configured types; relock immediately after fulfilment | ✅ | `tests/document-workflow-33.test.ts`; `tests/request-23.test.ts` (9); `src/lib/document-requests.ts` (`isAgencyRequestableType`) |
| 1.10 | Top-up authorisation: agency requests only, cannot process its own, no auto-credit, no duplicates | ✅ | `tests/topup.test.ts` (13); audit checks on pending/rejected top-up rendering; `src/lib/topup.ts` |
| 1.11 | Safe deletion: hard delete only unreferenced, after server checks, with confirm | ✅ | `src/app/actions/config.ts` (FK probe → block with deactivate/archive suggestion); `tests/database-config.test.ts`; gate `CLEANUP` section |
| 1.12 | Never rewrite fee snapshots / ledger / document versions / audit | ✅ | `tests/config-snapshot.test.ts`; `tests/audit.test.ts`; `tests/wallet-statement.test.ts` |
| 1.13 | No secrets in audit metadata or error messages; no SQL/stack/schema leakage | ✅ | `tests/audit.test.ts`; audit check `public/activate: no internals leaked on an invalid token` |
| 1.14 | Production isolation (no schema change, no DATABASE_URL change, no migration replay) | 🚫 | Nothing executed against production; release plan only (§15 of final report) |
| 1.15 | Privilege escalation impossible (AGENCY_ADMIN → AGENCY_USER only) | ✅ | `tests/rbac.test.ts`; `src/app/actions/admin.ts` role guards; audit check `staff/users: role options constrained` |

## 2. Agency portal — dashboard, list, detail

| # | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| 2.1 | Tabs Overview / Documents / Messages / Activity (no Applicants, no big Billing) | ✅ | `src/app/portal/applications/[id]`; audit `agency dossier tabs` checks; `tests/ops-views-31.test.ts` |
| 2.2 | Overview: status, entered timestamp, live time-in-status, simplified progress (no false embassy step), applicant, fee, Action Required, billing summary, decision + document | ✅ | audit checks on the agency dossier; `tests/embassy-applicability-24.test.ts` (11) |
| 2.3 | Activity = human timeline with durations, no UUIDs/JSON | ✅ | audit §activity (no raw UUIDs on rendered pages); probe `no visible UUIDs` across 11 surfaces |
| 2.4 | Messages agency ↔ staff | ✅ | `tests/communications-36.test.ts` (12) |
| 2.5 | The agency always knows: what is happening, what ESSAFARIA is doing, last change, time in state, whether to act, next step | ✅ | `tests/status-model-22.test.ts`; `loading/next-step` copy on dossier; rendered audit status banner checks |
| 2.6 | Statuses data-driven; embassy stage optional per visa type (NOT_APPLICABLE / OPTIONAL / APPLICABLE) | ✅ | `tests/embassy-applicability-24.test.ts`; `tests/status.test.ts`; migration `0016`, `0017` |
| 2.7 | Final decision approved/rejected + document (PDF/JPG/PNG ≤ 2 MB) + note, atomic | ✅ | `tests/decision-workflow.test.ts` (14) |
| 2.8 | Dashboard KPIs Active / Action required / Completed / Wallet; Needs Your Attention above metrics; links to Applications + Wallet | ✅ | audit checks on `/portal`; `tests/ops-views-31.test.ts` |
| 2.9 | Applications list: search by reference/applicant + filters status/destination/date + mobile cards | ✅ / 🟡 | filters + card list rendered (`data-testid="applications-cards"`, `md:hidden`) — card layout verified structurally, not pixel-rendered |
| 2.10 | Notifications: title/explanation/date/read + deep link; mark-all → zero unread | ✅ | `tests/notifications-35.test.ts` (14) |
| 2.11 | Communications = dossier inbox | ✅ | `tests/communications-36.test.ts` |
| 2.12 | Profile: Agency / Team / My Account, logo ≤ 2 MB, AGENCY_ADMIN manages AGENCY_USER only, last-login fix, password show/hide + policy + duplicate-email check | ✅ | `tests/activation-form-40.test.ts` (3 — activation screen toggles localised in EN/FR/AR); `tests/forced-password-change-22.test.ts`; audit §password affordances (toggle + policy on `/portal/profile`) |

## 3. Wallet & statements

| # | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| 3.1 | Available balance is the primary figure; no KPI clutter | ✅ | audit `agency/wallet: balance-first summary` + `no credit/charge KPI cards` |
| 3.2 | Ledger table Reference / Date / Type / Amount / Before→After / Application / Reason | ✅ | audit ledger column checks; `tests/wallet-statement.test.ts` (11) |
| 3.3 | Period + type filters | ✅ | `tests/ledger-filters-34.test.ts` (9) |
| 3.4 | Statements: 1 month / 3 months / custom + CSV | ✅ | audit checks `period presets offer 1 month, 3 months, custom and all time`, active-state, covered window, CSV BOM + out-of-range window carries header only |
| 3.5 | Low-balance CTA + top-up request from the wallet/insufficient-balance page | ✅ | audit low-balance/CTA checks; `tests/topup.test.ts` |
| 3.6 | Immutable ledger, human references `WLT-2026-000123`; corrections only via compensating entries | ✅ | `tests/wallet.test.ts`; `tests/reference-integrity-32.test.ts`; `src/lib/wallet.ts` |
| 3.7 | One wallet service for both staff entry points; explicit Credit/Debit, positive amount, mandatory reason, confirm screen, debit fails if negative | ✅ | `src/lib/wallet.ts` + `src/app/actions/wallet.ts`; `tests/ops-views-31.test.ts`; `tests/wallet.test.ts` |

## 4. Application wizard (exactly 3 steps)

| # | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| 4.1 | Exactly 3 steps: Choose Visa / Upload Documents / Review & Submit; one traveller; no drafts | ✅ | `tests/wizard-22.test.ts`; `tests/draft-visibility-23.test.ts` |
| 4.2 | Applicant = Full Name + Nationality only (searchable, Algeria default) | ✅ | `tests/wizard-22.test.ts`; audit step-2 checks |
| 4.3 | Step 1: search-first, no country list, only destinations with ≥1 active visa type, accent-insensitive, keyboard/mobile/RTL, collapses to "Destination: X · Change" | ✅ / 🟡 | server-side filtering + rendered markup checks; keyboard/mobile interaction verified structurally only |
| 4.4 | Catalogue policy: B2B info (types/prices) never on the public site | ✅ | `tests/public-catalogue-policy.test.ts`; audit `public/countries` B2B-leak checks |
| 4.5 | Processing shown honestly — no "0–0 days" | ✅ | audit `config/visa-type editor: no 0–0 days shown`; `formatProcessingDays` ("on request") |
| 4.6 | Step 2: per-document cards (required/optional, formats, 2 MB max); 2 MB enforced client **and** server; safe MIME/filename; progress | ✅ | `tests/documents.test.ts`; `tests/document-workflow-33.test.ts` |
| 4.7 | Step 3: VISA / APPLICANT / DOCUMENTS / PAYMENT (fee, balance, after) summary; CTA "Submit application — {fee} DZD"; insufficient → disabled + required/current/missing + top-up CTA | ✅ | `tests/submission.test.ts`; `tests/submission-gate-22.test.ts`; `tests/wizard-22.test.ts` |
| 4.8 | Idempotent submit; success = reference/applicant/visa/charged/remaining + View / Create another / Back to dashboard | ✅ | `tests/submission.test.ts`; `tests/concurrency.test.ts` |
| 4.9 | No persistent abandoned drafts | ✅ | `tests/draft-visibility-23.test.ts` |

## 5. Staff operations

| # | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| 5.1 | Work-queue dashboard: clickable filtered cards + recent activity | ✅ | audit dashboard card checks; `tests/ops-views-31.test.ts` |
| 5.2 | Saved views: Mine / Unassigned / Docs missing / Docs requested / In process / Embassy / Urgent / Aging | ✅ | `src/app/admin/applications/page.tsx` (`data-testid="saved-views"`, 8 views) + audit |
| 5.3 | Global command search (reference/applicant/agency/country/visa, RBAC, deep links) | ✅ | `src/app/admin/search/page.tsx`; `src/components/staff-search.tsx`; audit search checks |
| 5.4 | Aging from real timestamps only | ✅ | `aging=7` view; `tests/ops-views-31.test.ts`; reports use real stamps (null when nothing decided) |
| 5.5 | Assignment audited + notified | ✅ | `tests/exports-bulk-37.test.ts` (16); `src/app/actions/applications.ts` |
| 5.6 | Immutable notes | ✅ | `tests/communications-36.test.ts`; `src/lib/notes.ts` guard |
| 5.7 | Workspace tabs Dossier / Documents / Communications / Billing / Activity | ✅ | `src/app/admin/applications/[id]/page.tsx` tab list + audit |
| 5.8 | Per-document Accept / Request replacement | ✅ | `tests/staff-doc-review-23.test.ts`; `tests/document-workflow-33.test.ts` |
| 5.9 | Safe bulk: assign / priority / export only, ≤ 200, finished excluded, per-dossier audit | ✅ | `tests/exports-bulk-37.test.ts`; audit `no forbidden bulk controls` (no bulk approve/reject/debit/delete) |
| 5.10 | Exports RBAC + tenant + active-filter scoped (CSV/XLSX), cap + truncation header | ✅ | `tests/exports-bulk-37.test.ts`; audit live export checks (CSV header/BOM, XLSX zip magic) |
| 5.11 | Staff business actions, not raw status dropdowns | ✅ | dossier action set + `tests/status-model-22.test.ts` |
| 5.12 | Staff users: fix binding bug; separate Staff vs Agency views; explicit actions; audit; no escalation | ✅ | `tests/rbac.test.ts`; `src/app/admin/users/page.tsx` (`view=staff|agency` + counts) + audit |
| 5.13 | Staff agencies: list/create + initial admin; tabs Overview/Users/Wallet/Applications/Activity; suspend with reason + confirm + audit | ✅ | `src/app/admin/agencies/[id]/page.tsx`; `tests/registration-approval.test.ts`; audit tab checks |
| 5.14 | Agency registration: rate limit, 2 MB uploads, duplicate detection, server validation, no auto credit; `AGR-2026-XXXXX`; 5 statuses; approval creates Agency + initial AGENCY_ADMIN with activation/forced change + audit; read-only after decision | ✅ | `tests/agency-registration.test.ts` (18); `tests/registration-approval.test.ts` (12); `tests/registration-e2e.test.ts`; `tests/forced-password-change-22.test.ts` |
| 5.15 | Config editors: INFORMATION / PRICING DZD / PROCESSING / DOC REQUIREMENTS / WORKFLOW / PUBLICATION; pagination 20/50/100; archive over delete; no duplicates/self-loops | ✅ | `src/app/admin/config/visa-types/[id]/page.tsx` (six named sections); `tests/config-editor-39.test.ts` (8); `tests/database-config.test.ts` |
| 5.16 | Reports: DZD by agency/country/status/visa/priority; list-first (inline bars only, no chart library); average processing from real timestamps only; CSV | ✅ | `src/app/admin/reports/page.tsx`; `tests/exports-bulk-37.test.ts`; audit `avg-processing` + DZD-column checks |
| 5.17 | Audit log immutable, human-readable, filterable, paginated 20/50/100, no secrets | ✅ | `tests/audit.test.ts`; audit pagination + `tests/ledger-filters-34.test.ts`; audit metadata rendering (UUID → `#8 chars`) |
| 5.18 | Settings: branding / CMS / legal, separate Save per section, preserve legal text, EN/FR/AR | ✅ | `tests/settings-sections-38.test.ts` (8); audit §Settings (3 forms, 6 legal fields, `dir="rtl"` on Arabic) |

## 6. Public site

| # | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| 6.1 | Mobile homepage: exactly ONE visible "Register your agency" CTA, hero fully visible, coherent responsive header with hamburger, no horizontal overflow | ✅ / 🟡 | `tests/public-mobile-50.test.ts` (5) + audit (`public-register-cta`, `public-menu-toggle`, overflow checks). Breakpoint structure verified; pixel rendering in a real browser unavailable in this sandbox |
| 6.2 | Tested at 320/360/375/390/412/430 + tablet/desktop in EN/FR/AR | 🟡 | Fluid width-agnostic layout, documented breakpoint review, plus the hosted `homepage §50` check (one mobile CTA + hamburger + no horizontal overflow) and the trilingual hosted checks. Still no browser engine to drive real viewports — see §11 of the final report |
| 6.3 | Genuine RTL, localized dates, RTL date picker | ✅ / 🟡 | `tests/date-picker-22.test.ts` (11); `tests/ui-i18n.test.ts` (7); audit `dir="rtl"` + Arabic copy checks |
| 6.4 | Helpful empty states, actionable errors, config-first content | ✅ | audit empty-state checks (`No destination matches your search` + next-step copy) |
| 6.5 | Search/filter/pagination standards on public lists | ✅ | new `/countries` search + region filter + 20/50/100 + `tests/config-editor-39.test.ts` |
| 6.6 | No invented SLAs — "Age"/"Time in status" wording only | ✅ | audit copy checks |
| 6.7 | Privacy/Terms rendered per language with last-updated date | ✅ | `src/app/(public)/privacy|terms`; `tests/settings-sections-38.test.ts` |

## 7. Explicitly out of scope / blocked

| # | Item | Status | Detail |
| --- | --- | --- | --- |
| 7.1 | Browser-driven E2E A–I (normal, insufficient+top-up, replacement, additional, direct approval, embassy, tenant attack, staff creation, mobile) | 🟡 | Server-side equivalents implemented and green (`submission`, `topup`, `document-workflow-33`, `decision-workflow`, `tenant-isolation`, `registration-approval`, `public-mobile-50`). No working browser in this sandbox (`playwright chromium` install fails) → interaction flows are **not** claimed as browser-verified |
| 7.2 | Hosted preview (Vercel + GitHub `Preview` environment) | ✅ | `PREVIEW_DATABASE_URL` is configured on the GitHub `Preview` environment. Gate run **35988387317** (35 PASS / 0 FAIL) and hosted verification run **35988387360** (119 PASS / 0 FAIL / 1 SKIP) both green on `6adf570`; hosted health reports `schema=visa_os_preview`, ledger 17 entries through `0017_decision_types_audience.sql`, and production untouched at `0012` |
| 7.3 | Production release | 🚫 | Not executed by instruction. Plan prepared only (final report §14) |
