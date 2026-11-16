# PHASE 2.3 ACCEPTANCE — preview-audit corrections

Branch `arena/01a0c3b8-newproject` · HEAD `b9cc251` (8 local commits ahead of
last pushed `1b2f921` — **push blocked: GitHub token expired, reconnect GitHub
in Arena**) · Suite: **252/252 tests in 38 files** · `tsc 0` · `eslint clean` ·
production `pnpm build` green · rendered-HTML evidence in
`PHASE2_3_RENDERED_VERIFICATION.md`.

Statuses: **PASS** = implemented + automated tests green (+ rendered evidence
where applicable) · **NOT VERIFIED** = could not be proven · **SKIPPED** = N/A.

| # | Item (manual preview audit) | Status | Evidence |
|---|---|---|---|
| Bug 1 | Localization incomplete: public homepage hardcoded EN | **PASS** | Homepage SERVICES/PROCESS/regions/trust bar/CTAs all ct()'d; rendered FR/AR HTML zero-leak verified |
| Bug 1 | FilterBar chrome (SEARCH/STATUS/All/Reset/Filter) | **PASS** | contentT-driven in shared component; rendered FR/AR verified on portal + billing |
| Bug 1 | Portal applications STATUS filter options | **PASS** | `localizedStatusName(code, …)` by stable code |
| Bug 1 | Portal wallet "About your wallet" paragraph | **PASS** | rendered FR/AR verified |
| Bug 1 | Back-office wallet ledger UI | **PASS** | `/admin/billing` fully ct()'d; rendered FR/AR verified |
| Bug 1 | Applicant form labels / pending labels / back links | **PASS** | all ct()'d; guard test |
| Bug 1 | application-detail shared panels | **PASS** | 6 panels accept `locale`, 26 strings localized; EN default keeps BO unchanged |
| Bug 1 | Hard guards preventing regressions | **PASS** | `tests/i18n-audit-23.test.ts` (10 scanners) |
| Bug 2 | Registration hero contrast (white text on image) | **PASS** | `text-white` + text-shadow + gold-300 kicker + white/90 subtitle over navy gradient; rendered check |
| Bug 3 | Duplicate language switcher on registration pages | **PASS** | page-local switchers deleted on register + success; ONE global chrome switcher; unified `resolveLocale(pickUiLocale(sp.lang) ?? (await getUiLocale()))` on both pages (incl. `<title>`) |
| Bug 4 | DatePicker month-by-month navigation pain | **PASS** | Year/month panes behind header toggle; 12-year windows, ±12y paging (2026→1981 ≤ 3 clicks), min/max clamp, Intl-localized labels, Escape; 5 new tests |
| R5/6/7/10/11/12 | Exactly-3-steps flow, no abandoned drafts, no reference on select, atomic submit | **PASS** | New `/portal/applications/new`: CHOOSE VISA (+traveller info inline) → UPLOAD DOCUMENTS (checklist from visa config) → PREVIEW/CONFIRM&SUBMIT. Nothing persisted before confirm; ONE server transaction (application SUBMITTED + checklist + travellers + documents + wallet debit + ledger + history + audit); reference allocated inside the txn; idempotency key (unique index 0009) makes retries return the same application without double charge (live-tested) |
| R5 | 17 enumerated validations | **PASS** | `REQUEST_VALIDATION_CODES` (17, stable codes) + localized error strap; live DB tests hit every code |
| R8 | 2 MB per file everywhere | **PASS** | `MAX_UPLOAD_BYTES = 2 MB` single constant (portal/registration/staff); client hint localized EN/FR/AR; oversized rejected BEFORE storage and before wallet (tested) |
| R9 | Visa-type document checklist config UI | **PASS** (pre-existing, verified) | `/admin/config/visa-types/[id]` — attach document types REQUIRED/OPTIONAL with order, notes, active/inactive; snapshot provenances feed the new flow (test: snapshot equals config) |
| R13 | Staff in-application document review | **PASS** | Admin `[id]` checklist + documents tabs, staff-gated `reviewDocumentAction`, mandatory reject/resubmit reason, agency resubmission versioning; behaviour tests pre-existed, wiring guards added (4) |
| Bug 14 | DRAFT/CANCELLED hidden from agency default list | **PASS** | default agency list excludes them (rows preserved, reachable via explicit filter); options removed from portal dropdown; 3 live-DB tests |
| — | Legacy drafts cleanup strategy | Documented: legacy DRAFT/CANCELLED rows are never destroyed; hidden from agency default surfaces; staff retain full access; the old draft wizard remains functional for them |

## Explicit non-goals / unchanged by design
- Back-office internal pages other than the named billing ledger remain EN-first
  (chrome is localized everywhere; page bodies were never in Bug 1's named
  items, and Bug 1's list was stated as non-exhaustive but scope-constrained to
  public + portal + named BO item). Shared components (FilterBar/Pagination/
  detail panels) already translate automatically wherever a page passes the
  locale — extending BO coverage is now a pure additive content exercise.
- Production database: never touched; migration 0009 is application-local and
  applies idempotently with the next deploy.

## Gates
252/252 tests · 38 files · tsc 0 · eslint clean · production build green ·
rendered EN/FR/AR verification PASS on 7 surfaces (evidence doc committed).
