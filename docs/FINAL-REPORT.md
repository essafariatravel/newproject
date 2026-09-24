# ESSAFARIA VISA OS — Final Report

Branch `arena/01a0ce58-newproject` · head `ae51ebd` · base production release `3a1cdc9` (untouched)
Preview-first session · **STOP BEFORE PRODUCTION** · no production operation performed.

---

## 1. Executive Result

The back-office, agency portal and public site are **implemented, tested and preview-verified** in-repo, and the session stopped exactly where instructed: before any production change.

* Verification snapshot: `tsc` clean · `lint` clean · **412 automated tests in 52 files pass** · production build **exit 0** · rendered audit against a real server **542 passed / 0 failed / 2 classified** · local pre-production gate **ALL GATES PASSED** (34 sections).
* Financial integrity: submission debits the prepaid DZD wallet **exactly once** (atomic, concurrency-tested), the ledger is immutable with human references, balances can never go negative, and all corrections are compensating entries.
* Security: every authorisation decision is server-side; cross-tenant read/mutate/document/wallet/message/export attempts are refused (tests + live rendered checks); no secrets in audit metadata or error surfaces.
* Product surface: 3-step wizard, post-submit document locking with staff-only reopen, staff work queue with saved views and safe bulk actions, DZD-only reporting/exports, agency wallet with 1/3/custom-month statements + CSV, and a public site whose mobile homepage has exactly one "Register your agency" CTA.
* Two items are **not** claimed as verified and are classified honestly: **pixel-level responsive/RTL inspection** (no browser engine in this sandbox) and the **hosted preview** (missing deployment credential).
* Production is untouched and serves the previous verified release; §14 is a plan only.

## 2. Discovery / Root Causes

The session started from a running preview and a working suite, which is exactly why it was re-audited against the master directive instead of being trusted. The material root causes found and fixed:

| Symptom | Root cause | Fix |
| --- | --- | --- |
| Wallet could be debited twice under parallel submits | read-then-write balance check outside a transaction, no idempotency key on the submission debit | single transactional debit path with idempotency keyed on the application; concurrency test added |
| Agency saw documents as "missing" that ESSAFARIA issues itself (decision letters) | document types had no audience concept; the agency-facing checklist treated every type as uploadable | new `document_types.agency_uploadable` (migration 0016) + `0017` for decision types; service layer refuses the upload *and* the request |
| Post-submit document slots stayed open | authorisation on upload was based on the application being editable rather than on an explicit staff request | upload path now requires an open, per-slot request; relock is immediate on fulfilment; v1/v2 preserved |
| Config editor was one undifferentiated "Edit" block | presentation debt: fees, processing and workflow mixed; no publication semantics | six named sections (INFORMATION / PRICING DZD / PROCESSING / DOC REQUIREMENTS / WORKFLOW / PUBLICATION) |
| Lists behaved differently per screen (no page-size standard, no cards on phones, no search on `/countries`) | each list had grown its own controls | shared `PAGE_SIZE_OPTIONS`/`resolvePageSize`, shared `PageSizeSelector`, agency list gained mobile cards, public destinations gained search + region filter + pagination + actionable empty states |
| Staff/agency user populations were mixed, and role dropdowns leaked staff roles onto agency rows | one list + one role list for two different populations | split views with real counts, population-filtered role options, server guards unchanged (escalation impossible) |
| Legal text was not editable per language; saving content risked blanking other sections | one settings form writing a whole settings blob | per-section forms that write only their own keys; per-language legal keys with fallback; audit metadata records `{section, keys}` |
| Data bugs were being surfaced as UI text | e.g. "0–0 days" and misleading embassy steps in progress | catalogue processing rendered as "on request" when zero; embassy stage is per-visa-type (`NOT_APPLICABLE / OPTIONAL / APPLICABLE`) and is not shown when not applicable |

## 3. Implemented Changes

Delivered across the session (all committed on `arena/01a0ce58-newproject`):

* **Migration 0016** — `document_types.agency_uploadable` (not null, default true) so ESSAFARIA-issued documents can never be requested from, or uploaded by, an agency.
* **Migration 0017** — decision-type audience wiring for the same rule.
* **Document workflow service layer** — `isAgencyRequestableType` / `listAgencyRequestableDocumentTypes`; staff-issued types throw `VALIDATION` when requested; agency upload of a staff-issued type returns `UPLOAD_NOT_ALLOWED`.
* **Exports** — dependency-free CSV (BOM, RFC 4180, `=+-@` neutralised) and real XLSX (hand-rolled ZIP, `deflateRawSync` + CRC32); `applications.view.all` / `reports.view` scoped, active-filter aware, tenant-scoped, audited (`APPLICATIONS_EXPORTED`, `REPORTS_EXPORTED`), capped at 5 000 rows with `X-Export-Truncated`.
* **Safe bulk actions** — assign and priority only, ≤ 200 dossiers, finished dossiers excluded, per-dossier audit + notification. No bulk approve/reject/debit/delete anywhere in the UI.
* **Pagination standard** — 20/50/100 on audit, staff and agency application lists, and both config lists, with hostile input sanitised back to 20.
* **Settings** — branding, website content and legal content save independently; legal copy per EN/FR/AR (`legal.privacy.*`, `legal.terms.*`) with a legacy single-language fallback; privacy/terms pages localised with a real "last updated" date.
* **Users & agencies** — separate ESSAFARIA staff / agency user views with real counts; `PasswordField` (show/hide + explicit policy) on every password-setting screen; the staff agencies screen fully localised; agency onboarding remains SUPER_ADMIN-only.
* **Wallet statements** — 1 month / 3 months / custom / all-time presets, the covered window stated in words, and CSV export resolving the identical period server-side.
* **Visa-type editor** — six explicitly named sections with DZD-labelled pricing, fee-snapshot semantics spelled out, publication explained in terms of agency impact.
* **Public destinations** — accent-insensitive search, region filter, pagination standard, actionable empty states in EN/FR/AR; no B2B information (types/prices) on the public page.
* **Agency application list** — real card list below `md`, table above; identical data and destinations.
* **Rendered audit** — grown to 542 checks, including live audit of the wallet CSV (BOM, type, out-of-range window), XLSX zip magic, tenant refusals and localised password affordances.
* **Tests** — `exports-bulk-37` (16), `settings-sections-38` (8), `config-editor-39` (8), `activation-form-40` (3), plus additions to i18n and accounting guards; suite is now 52 files / 412 tests.

## 4. Requirement Completion Matrix

Full requirement-by-requirement matrix, with per-line evidence: **`docs/COMPLETION-MATRIX.md`**.

Summary by domain: P0 security & financial integrity **15/15 verified** (production isolation by instruction) · agency portal & wallet **19/19** · wizard **9/9** · staff operations **18/18** · public site **5 verified + 2 structurally verified** · blocked/classified: hosted preview (missing credential), browser-driven E2E (no browser engine), pixel-level responsive/RTL inspection (same cause), production execution (out of scope).

## 5. Database Changes / Migrations

| Migration | Purpose | Applied to |
| --- | --- | --- |
| `0016_document_type_audience.sql` | `document_types.agency_uploadable` (not null, default true) | local `public` **and** local `visa_os_preview` |
| `0017_decision_types_audience.sql` | decision-document audience rule | local `public` **and** local `visa_os_preview` |

Both are forward-only, idempotent, additive (no column dropped, no data rewritten, no history cascaded), and were applied preview-first. Migration 0001–0015 were never replayed, and no applied migration file was modified. Hosted `visa_os_preview` still stops at 0012 — see §13. No production schema was touched.

## 6. RBAC / Security Verification

Verified by executed tests and by live rendered/HTTP checks (not by reading source):

* **Tenant isolation** (`tests/tenant-isolation.test.ts`, 11 tests): cross-tenant read, mutate, document, wallet, message and export attempts are refused; explicit foreign `agencyId` query parameters are ignored because scope always comes from the session.
* **Live refusals** (rendered audit): anonymous agency wallet export → refused; staff session against the agency wallet export → refused; agency session against staff export routes → refused; agency session opening `/admin/config/visa-types/:id` → refused.
* **Role model** (`tests/rbac.test.ts`): staff work with `agency_id = NULL`; AGENCY_ADMIN is bound to exactly one agency and can only create/manage AGENCY_USER; wallet mutation limited to SUPER_ADMIN / ADMIN / ACCOUNTING (VISA_AGENT view-only); no privilege-escalation path (server actions re-validate role, not just the form).
* **Upload enforcement**: 2 MB enforced client-side *and* server-side; MIME/filename sanitised; uploads scoped to the owning agency; locked slots refuse uploads until a matching staff request exists.
* **Error hygiene**: no SQL/stack/schema/secrets in user-visible errors; unexpected errors return a safe message plus correlation id (audit check on an invalid activation link confirms no internals leak).
* **Secret hygiene**: no credential was requested, printed or stored in this session; audit metadata is inspected for sensitive keys by test.

## 7. Automated Test Results

| Check | Command | Result |
| --- | --- | --- |
| Types | `npx tsc --noEmit` | clean |
| Lint | `npm run lint` | clean |
| Unit/integration | `npx vitest run` | **52 files / 412 tests passed** (`/tmp/vitest-run23.log`) |
| Production build | `npm run build` | **exit 0** (`/tmp/build18.log`) |
| Rendered audit (real server, real sessions) | `node scripts/rendered-audit.mjs` | **542 passed · 0 failed · 2 classified** (`/tmp/audit29.log`) |
| Pre-production gate (preview schema) | `npx tsx scripts/pre-prod-gate.ts` (`visa_os_preview`) | **ALL GATES PASSED**, 34 sections (`/tmp/gate-local21.log`) |
| Rendered state fixtures | `npx tsx scripts/rendered-state.ts` | regenerated (`/tmp/state12.log`) |

Notable suites: `phase2-final` (24), `price-adjustments-22` (19), `agency-registration` (18), `document-workflow-33` (18), `exports-bulk-37` (16), `decision-workflow` (14), `notifications-35` (14), `topup` (13), `communications-36` (12), `i18n-audit-23` (12), `registration-approval` (12), `date-picker-22` (11), `tenant-isolation` (11), `wallet-statement` (11), `rbac` (11), `config-editor-39` (8), `settings-sections-38` (8), `activation-form-40` (3).

**Nothing unrun is reported as PASS.** Two rendered checks are explicitly classified as *not verified by rendering* (§11) and the browser-dependent E2E set is not claimed as executed (§12).

## 8. Wallet / Financial Integrity Verification

* **No double debit**: concurrent submissions of the same application produce exactly one ledger debit; the loser is rejected with an actionable error (`tests/concurrency.test.ts`, `tests/submission.test.ts`).
* **Never negative**: a debit that would take the balance below zero is refused server-side, with the required/current/missing amounts returned to the wizard so the agency can top up (`tests/submission-gate-22.test.ts`).
* **Immutable ledger**: amounts, `balanceBefore`/`balanceAfter` snapshots and human references (`WLT-2026-000123`) are written once; no update/delete path exists; corrections use compensating entries only (`tests/wallet.test.ts`).
* **Top-up integrity**: an agency can create only its own request (DZD + note), cannot process it, processing never auto-credits, the credit happens through the normal authorised wallet mechanism, request→transaction link + status + notification + audit are recorded, and duplicates are refused (`tests/topup.test.ts`, 13 tests).
* **Staff wallet operations**: one service for both entry points, explicit Credit/Debit, positive amounts, mandatory reason, confirm screen, debit fails if it would go negative, restricted to SUPER_ADMIN / ADMIN / ACCOUNTING (`tests/ops-views-31.test.ts`, `tests/rbac.test.ts`).
* **Statements**: derived server-side from ledger snapshots, DZD-first; historical non-DZD rows are reported separately and never converted or summed into DZD totals (`src/lib/wallet-statement.ts`, `tests/wallet-statement.test.ts`).
* **Live evidence**: agency wallet shows balance-first summary with no KPI clutter, period presets 1 month / 3 months / custom / all time, the covered window stated in words, and a CSV export that follows the same window (out-of-range window returns header only — no invented rows).

## 9. Application & Document Workflow Verification

* **Wizard**: exactly 3 steps (Choose Visa / Upload Documents / Review & Submit), one traveller per application, applicant captured as Full Name + Nationality only, no persistent abandoned drafts. Step 1 is search-first with no country list and only shows destinations that have at least one active visa type; the selection collapses to "Destination: X · Change".
* **Step 2**: per-document cards state required/optional, accepted formats and the 2 MB limit; uploads are MIME- and filename-sanitised; missing required documents block submission **server-side**, not only in the UI.
* **Step 3**: VISA / APPLICANT / DOCUMENTS / PAYMENT summary with fee, current balance and resulting balance; the CTA reads "Submit application — {fee} DZD"; when the balance is insufficient the CTA is disabled and the screen names what is required, what is available, what is missing, with a "Request wallet top-up" route (no dead end). Submission is idempotent; success shows reference, applicant, visa, amount charged, remaining balance and View / Create another / Back to dashboard.
* **Locking**: after submit the agency can view, preview and download only. Only an explicit staff document request reopens a specific slot, replacement opens just that slot, additional documents come only from configured types, and the dossier relocks immediately on fulfilment — a further upload requires a **new** staff request. Version history is never overwritten (v1/v2 preserved), all enforced server-side.
* **Statuses**: data-driven; business actions (Start review, Validate documents, Request replacement/additional, Move to processing, Sent to embassy, Record decision) rather than raw dropdowns; the embassy stage exists only when the visa type declares it applicable (migration 0016/0017 + `tests/embassy-applicability-24.test.ts`).
* **Decision**: approved/rejected with a supporting document (PDF/JPG/PNG ≤ 2 MB) and a note, applied atomically (`tests/decision-workflow.test.ts`).

## 10. Localization EN / FR / AR + RTL

* Every user-visible string added this session is threaded through the content/UI dictionaries; the guard test fails the build if any `ct("literal")` has no dictionary entry — it caught missing entries twice during the work (fixed, not suppressed).
* Arabic screens render `dir="rtl"` with right-to-left layout and localised dates; the RTL date picker is covered by `tests/date-picker-22.test.ts` and the UI dictionary by `tests/ui-i18n.test.ts` + `tests/i18n-audit-23.test.ts`.
* Password affordances are localised: the activation page, change-password and portal screens receive localised show/hide labels, so a French or Arabic screen can never display an English "Show"/"Hide" (live audit check).
* Legal pages resolve `legal.X.<locale>` → `legal.X` → built-in fallback, so existing English legal text is preserved while French and Arabic can be added by staff, per language, without touching branding or website content.
* Mixed-language regressions found during the session were fixed at the source (staff agencies page was hardcoded English and is now fully dictionary-driven).
* A server-render test of the activation form caught a further real leak: the confirm-password field's hint fell back to the English default on French and Arabic screens. The field now receives the localised hint, and `tests/activation-form-40.test.ts` pins both languages plus the reveal-control wiring.
* Classified: **visual** RTL correctness (text direction, number/date placement in situ) is verified structurally and by localisation tests, not by a browser screenshot — see §11.

## 11. Responsive / Mobile Verification

Verified structurally and by server-rendered inspection:

* Homepage exposes exactly **one** visible "Register your agency" CTA at mobile widths and a coherent hamburger menu (`data-testid="public-menu-toggle"`), hero content is not clipped, and the layout uses fluid widths without fixed pixel minimums that would force horizontal overflow (`tests/public-mobile-50.test.ts`, 5 tests; audit checks).
* List surfaces switch to cards below `md` (agency applications) and the public destinations page is a fluid card grid; breakpoints are expressed with Tailwind's standard `sm/md/lg` steps that cover the required 320/360/375/390/412/430 handset widths plus tablet and desktop.
* Arabic and French mobile pages are checked for direction and for localised copy in the rendered audit.

**Classified, not claimed as PASS**: pixel-level inspection at each individual handset width requires a real browser engine. This sandbox cannot download one (only the npm registry is reachable; `playwright chromium` installation fails), so the two width/step checks in the rendered audit report themselves as *NOT VERIFIED BY RENDERING* rather than green. Structural rules pass; a device or browser pass remains the outstanding visual gate.

## 12. Rendered UI Evidence

The rendered audit drives a **real production build over HTTP** (`http://localhost:3100`, build from `npm run build`, head `ae51ebd`) with real sessions for SUPER_ADMIN, ADMIN/staff and AGENCY_ADMIN, and inspects the real HTML:

* 542 assertions passed, 0 failed, 2 classified.
* Coverage: public pages (home in EN/FR/AR, destinations search/filter/pagination/empty state, legal pages, activation with an invalid token, change-password), agency portal (dashboard, applications list + cards, dossier tabs, wallet with period presets and CSV, communications, notifications, profile), staff back-office (dashboard, work queue + saved views + filters, dossier workspace tabs, exports CSV/XLSX, bulk bar, users split views, agencies + onboarding, registrations, config editors incl. the six visa-type sections, reports, audit, settings with three independent save buttons and Arabic legal field).
* Abuse attempts are part of the audit: anonymous/staff/agency cross-role requests to wallet and export endpoints, foreign-scope parameters, invalid activation tokens, hostile `per=5000` page sizes — all refused or sanitised.
* Evidence logs: `/tmp/audit28.log` (audit), `/tmp/vitest-run22.log` (suite), `/tmp/build17.log` (build), `/tmp/gate-local20.log` (gate), `/tmp/state12.log` (fixtures).
* Not browser-driven: interaction sequences (clicking through upload/confirm screens) are exercised by integration tests at the service/action layer; the two classified audit notes record exactly which checks need a browser.

## 13. Hosted Preview Verification

**Status: BLOCKED by a missing deployment credential — documented, not worked around.**

* The GitHub environment `Preview` exists alongside `Production`, but the gate workflow `pre-prod-gate.yml` fails in its first step *Guard — secrets and schema pin* because `PREVIEW_DATABASE_URL` is not set for that environment (latest run `35982950166`, failure in ~11 s; identical failure on the four preceding pushes).
* Consequence: hosted migration state for the preview schema is stale relative to local (hosted `visa_os_preview` was last known at `0012`; migrations `0013`–`0017` are applied locally only), and the hosted preview cannot be exercised end-to-end from CI.
* Why it was not resolved here: the value is a database credential. It is not present in this workspace and must not be pasted into chat, so this is a genuine external blocker — adding it is a one-step action in the repository settings (Environments → `Preview` → add `PREVIEW_DATABASE_URL`, pointing at the preview schema of the existing project). No secret was requested, guessed or fabricated.
* Everything else continues to be verified locally against the same schema name (`DATABASE_SCHEMA=visa_os_preview`) with the local Postgres, which is why the local gate can pass while the hosted gate is blocked.
* Production health endpoints confirm the production release is serving and untouched: schema `visa_os`, ledger up to `0012` for that release, `connected: true`, `columnsValid: true`.

## 14. Production Release Plan — PLAN ONLY, DO NOT EXECUTE

Preconditions (all must be true before any step below is run):

1. Hosted preview unblocked (`PREVIEW_DATABASE_URL` added to the `Preview` environment) and the preview gate workflow green on the exact commit to be released.
2. Migrations `0016` and `0017` applied to hosted `visa_os_preview` and verified there (forward-only, idempotent, additive — no destructive statement).
3. Preview E2E: the A–I scenarios executed against the hosted preview with a real browser, including mobile widths and Arabic RTL.
4. A backup/restore point of production `visa_os` exists and has been tested (restore drill), with the snapshot retained until the release is declared stable.
5. A named human reviewer signs off the RBAC/tenant-isolation and wallet-integrity evidence in §6 and §8.

Release sequence (each step gated on the previous one):

1. **Announce and freeze** — no merges to the release commit; record the exact SHA.
2. **Apply migrations 0016 → 0017** to production `visa_os` in a maintenance window, one at a time, each followed by a schema/column verification query. Never replay `0001`–`0015`. Never modify an already-applied migration file.
3. **Deploy the application build** that corresponds to the verified commit; do not change `DATABASE_URL`, do not rotate credentials, do not repoint the Supabase project as part of this release.
4. **Smoke verification in production, read-only where possible**: staff login, work-queue render, one dossier open (no mutation), agency login, wallet balance + statement render, one export download, public homepage in EN/FR/AR at mobile and desktop widths, single-CTA check on the mobile homepage.
5. **First controlled transaction**: on a designated test agency, one wallet credit by an authorised accounting user with a written reason, one top-up request → staff review → credit, one application submitted end-to-end with documents, one document request → agency fulfilment → relock, one decision recorded with document. Confirm the ledger entries, audit rows and notifications for each.
6. **Observation window** — monitor error rate, 5xx responses, wallet discrepancies (ledger sum vs balance), and document-upload failures; keep the rollback artefact (previous image + pre-migration backup) available for the whole window.
7. **Rollback plan** — application rollback to the previous image is the primary lever; the migrations are additive so they do not need reverting (and must not be reverted by dropping columns with live data). If a data issue is found, correct it with compensating entries, never by editing ledger or audit rows.
8. **Post-release close-out** — record the migration output, the smoke-test results, the transaction evidence and any follow-up tickets in the release log; update the completion matrix with the production evidence.

Explicit non-goals for this release: no bulk approve/reject/debit/delete, no currency change, no rewrite of fee snapshots, ledger, document versions or audit history, no removal of existing legal text.

## 15. Remaining Risks / Known Issues

| # | Item | Severity | Detail / next action |
| --- | --- | --- | --- |
| 1 | Hosted preview blocked | High (delivery, not product) | `PREVIEW_DATABASE_URL` missing in the GitHub `Preview` environment; hosted preview schema therefore stale (`0012` vs local `0017`). Owner action: add the secret, then re-run the gate workflow |
| 2 | No browser engine in the sandbox | Medium | Pixel-level responsive (320–430) and visual RTL/date-picker inspection are **structural only**; two rendered-audit checks self-report as not verified. Requires a device/browser pass before production |
| 3 | Browser-driven E2E A–I not executed | Medium | Server-side equivalents are green (`submission`, `topup`, `document-workflow-33`, `decision-workflow`, `tenant-isolation`, `registration-approval`, `public-mobile-50`), but the interaction-level runs remain outstanding |
| 4 | Legacy non-DZD ledger rows | Low | Preserved unchanged and reported separately (never converted or summed into DZD); historical integrity is intentional |
| 5 | Notification delivery is in-app only | Low | By design (no email/SMS gateway in scope); deep links and read-state are verified |
| 6 | Statements are printable financial statements, not tax invoices | Low | Deliberate: no invoice sequencing or fiscal numbering was invented |
| 7 | Legal text still English-only in production data | Low | Multilingual capability is implemented and tested; French/Arabic copy must be entered by staff (existing English text is preserved, never overwritten) |
| 8 | Production release | — | Not performed; §14 is a plan subject to the five preconditions above |
