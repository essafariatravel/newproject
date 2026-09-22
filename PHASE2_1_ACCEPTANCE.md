# Phase 2.1 — Visual Review Corrections (A/B/C)

Applied on branch `arena/01a0c3b8-newproject` (commit `7105320` for B, `5c23f43` + follow-up for A/C).
Verified against a production build (`next build && next start`) backed by a
fully migrated local PostgreSQL (all migrations 0001–0005 applied, seed data),
driving the real HTML with the exact cookies a user gets (session + `evos_ui_locale`).

## A. Content localization (EN / FR / AR + full RTL) — FIXED

Earlier state translated only the nav shell; page content stayed English.
Correction work:

- New platform-content dictionary `src/lib/i18n-content.ts` (~240 UI strings:
  KPI cards, table headers/empties, form labels/placeholders/buttons, wallet &
  statement copy, final-decision panel, marketing copy, login, agency portal).
  No machine/browser translation; curated FR + Arabic.
- Threaded `ct()` into: admin dashboard (incl. greeting, all KPI cards,
  Recent applications, Wallet activity, Ledger, View all), admin application
  detail (Workflow form, Submission-gate override, **Final decision** panel —
  labels, outcome select, buttons, hints, internal notes), admin applications
  list (table + filters), agency portal dashboard / applications list & detail /
  new-application / wallet + statement generator / documents / communications /
  notifications / applicants / profile, public home/visas/b2b/countries/about/
  contact + login page (client components receive a `copy` prop).
- `StatusBadge`, `DocStatusBadge`, `PriorityBadge` now render localized labels
  platform-wide (moved to `components/badges.tsx` as async server components so
  `ui.tsx` stays client-safe).
- Database/user values (agency names, references, applicant names, notes,
  free text) are never translated; config-driven multilingual content keeps
  its stored EN/FR/AR values.

### Hosted evidence (rendered HTML, real server)

- `GET /admin` (FR session) → "Bonjour/Bonsoir …", "Total des dossiers",
  "Documents en vérification", "Terminés / approuvés", "Refusés",
  "Agences actives", "Inscriptions d'agences", "Dossiers récents",
  "Activité des portefeuilles", "Voir tout", "Grand livre".
- `GET /admin/applications/{id}` (FR, file at AWAITING_DECISION) →
  "Décision finale", "Changer le statut vers", "Issue", "Document de décision",
  "Enregistrer la décision", "Notes internes"; outcome options exactly
  [`Approuvé`, `Refusé`]. (AR) → `<html lang="ar" dir="rtl">` and options
  [`مقبول`, `مرفوض`].
- `GET /portal` (AR) → `dir="rtl"`, "لوحة تحكم الوكالة"; wallet (FR) →
  "Portefeuille & Transactions", "Solde actuel", "Télécharger le relevé du
  portefeuille (PDF)"; new application (FR) → "Nouveau dossier",
  "Programme de visa", "Créer le dossier (brouillon)".
- Public pages (FR): hero "Le système d'exploitation du …", CTA
  "Enregistrer votre agence"; visas/b2b/countries/about/contact sections
  rendered in French; login page in French. No public fees/catalogue values.

### Regression gates (CI)

- `tests/i18n.test.ts`: every string the visual review flagged must carry FR +
  Arabic translations (asserted verbatim); every registered dictionary key must
  be non-empty in both locales; every `ct("literal")` call in `src/` must
  resolve to a dictionary key; raw EN literals (`label="Total applications"`
  etc.) must never reappear on translated screens (no-nav-only step-up guard);
  portal dashboard/wallet must stay ct-driven.

## B. Final decision model — FIXED (APPROVED / REJECTED only)

- Migration `0005_canonical_decision_model.sql` (idempotent):
  audits existing REFUSED usage via notices; remaps live applications
  REFUSED→REJECTED (history rows preserved untouched); deletes all REFUSED
  transition edges; keeps the REFUSED row inactive renamed "Rejected (legacy)"
  (visible in dropdowns of historical views with a clearly-marked label);
  guarantees REJECTED edges and restricts APPROVED to `AWAITING_DECISION`
  only. No historical data rewrites.
- `DecisionOutcome = "APPROVED" | "REJECTED"` everywhere; generic status
  dropdown never offers final outcomes; the dedicated **Final decision**
  control offers exactly two localized options.
- APPROVED requires `DECISION_VISA_APPROVAL` document; REJECTED requires
  `DECISION_REFUSAL_LETTER` (+ reason note); record is atomic (document +
  status + agency notification + audit), tenant-isolated. Document types
  localized via `DECISION_DOC_TYPE_LABELS`.
- Regression tests (+3): outcomes strictly canonical (legacy REFUSED rejected
  with VALIDATION), REFUSED row inactive and edge-free, APPROVED reachable
  only from AWAITING_DECISION; prior decision/tenant-isolation suites green.

## C. Public header logo — FIXED

- Public header renders the uploaded logo at `h-12 sm:h-14`, `w-auto`,
  `object-contain` (no crop, aspect preserved), max width `min(62vw, 280px)`,
  RTL-aligned. When a full brand mark is uploaded the wordmark/monogram text
  block is NOT duplicated. Back-office and Agency Portal headers keep their
  compact mark (h-12), as required.
- Verified in rendered HTML with a stored brand logo:
  `<img src="/api/branding/logo?v=…" alt="ESSAFARIA TRAVEL" class="h-12 w-auto
  max-w-[62vw] object-contain object-left sm:h-14 sm:max-w-[280px]
  rtl:object-right">` and no duplicated brand text in the header.

## Gates

- `tsc --noEmit` clean; `eslint` clean; `next build` green;
  vitest **163/163** green (27 files).
