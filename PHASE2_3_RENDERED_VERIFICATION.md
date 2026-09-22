# Phase 2.3 — Rendered-HTML verification evidence (Bug 1 / Bugs 2·3·4)

Method: production build (`pnpm build`), real embedded PostgreSQL @5432
(migrated + seeded), `next start -p 3001`, locale cookies
(`evos_ui_locale=en|fr|ar`), agency session `admin@horizonvoyages.example`,
staff session `admin@essafaria.example`. Raw HTML was fetched and grepped
both WAYS per locale: required localized strings present, forbidden EN
strings absent. Files saved under `/tmp/verify/` during the run.

## Results (all PASS)

| Surface | EN | FR | AR | Notes |
|---|---|---|---|---|
| `/` (public homepage) | PASS | PASS | PASS | Trust bar (Wholesale/Dedicated/Real-time/Audited), SERVICES, PROCESS, regions, CTAs — fully translated; zero EN leaks in FR/AR; `<html dir="rtl">` on AR |
| `/agency/register` | PASS | PASS | PASS | One global language switcher only (bug 3); hero contrast classes present (bug 2); `<title>` localized via the same cookie-aware resolution; localized copy (registrationCopy) in body |
| `/portal/applications` | PASS | PASS | PASS | FilterBar chrome (SEARCH/STATUS/All/Filter/Reset) localized; STATUS options via `localizedStatusName(code)`; DRAFT/CANCELLED absent from dropdown (bug 14) |
| `/portal/wallet` | PASS | PASS | PASS | "About your wallet" paragraph localized (FR/AR) |
| `/portal/applications/new` | PASS | PASS | PASS | 3-step rail localized; error strap codes → localized messages; 2 MB hint localized |
| `/admin/billing` | PASS | PASS | PASS | Ledger UI localized (Bug 1 named back-office item): PageHeader, stat cards, filter, column headers, adjustment form |

## Guard tests that pin this forever

- `tests/i18n-audit-23.test.ts` (10) — raw-EN scanners over all audited
  surfaces + wiring invariants + 2 MB dict coverage EN/FR/AR.
- `tests/request-23.test.ts` (8) — atomic 3-step submit, 17 enumerated
  validations, idempotent replay (same application, single charge), 2 MB cap,
  checklist snapshot from config, no DRAFT left behind.
- `tests/draft-visibility-23.test.ts` (3) — legacy drafts hidden in default
  agency list, reachable via explicit filter, rows preserved.
- `tests/staff-doc-review-23.test.ts` (4) — in-application staff review
  surface (checklist + documents tabs, gated actions, mandatory reasons).
- `tests/date-picker-22.test.ts` (+5) — year/month panes, 12-year windows,
  decades-in-the-past economics (2026→1981 ≤ 3 range clicks), min/max clamping.
