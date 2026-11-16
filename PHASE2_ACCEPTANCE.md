# Phase 2 Acceptance — Public Agency Registration & Approval Workflow

**Scope**: complete public → staff-reviewed agency onboarding for ESSAFARIA VISA OS,
fully integrated with the existing agencies / users / RBAC / documents / notifications /
audit stack. No parallel authentication or agency system was introduced; every pathway
reuses the existing models, services and design tokens.

**Branch/preview**: implemented and verified on the Phase 2 preview branch only.
Production was not modified.

**Quality gates (this branch)**

| Gate | Result |
| ---- | ------ |
| `npm run test` (Vitest, embedded PostgreSQL 17) | **115 / 115 passing** across 20 suites |
| `npm run typecheck` (`tsc --noEmit`) | clean |
| `npm run lint` (ESLint flat config) | clean |
| `npm run build` (production) | compiles; all new routes present |
| Local live HTTP verification (dev server + embedded PG, demo data) | all checks pass |
| Hosted Vercel Preview verification (GitHub Actions, real HTTP) | **PASS 15 / FAIL 0 / SKIP 13** (see §11) |

---

## 11. Hosted Preview evidence (2026-09-21)

**Preview deployment:** https://newproject-p3vm1nx81-essafaria-travel-s-projects.vercel.app
(Vercel deployment `6568845431`, environment *Preview*, state *success*, built from
app commit `7d89360`; tip commit `5f9bfcf` adds **only** `scripts/hosted-verify.sh`
and `.github/workflows/preview-verify.yml` — no application-code change, and its own
Preview build `6569743291` also succeeded.)

**Preview database:** Supabase transaction pooler, schema `visa_os_preview` (Production
`visa_os` untouched). Proven by the hosted `/api/health` payload from that deployment:

```json
{"ok": true, "deployment": {"environment": "preview"},
 "database": {"configured": true, "connected": true, "intendedSupabaseProject": true,
              "ssl": "verify-full", "error": null},
 "schema": {"name": "visa_os_preview", "columnsValid": true,
            "migrationLedger": ["0001_init.sql", "0002_branding.sql",
                                "0003_agency_registrations.sql"],
            "hasUserAccounts": true, "visaProgrammes": 8, "countries": 16}}
```

Migration `0003_agency_registrations.sql` is applied in the **Preview** ledger — the
build-time migrator ran on the Preview schema only, exactly as designed.

### Hosted run — GitHub Actions run `35607168970` (branch `arena/01a0c3b8-newproject`)

`scripts/hosted-verify.sh` executes a real browser-style journey with curl
(progressive-enhancement form posts, cookie jars, multipart upload) against the live
Preview URL from a clean GitHub-hosted runner. Full log excerpt:

```
== Phase 2 hosted verification ==
Target: https://newproject-p3vm1nx81-essafaria-travel-s-projects.vercel.app
-- [0] Health check
PASS  health: ok=true, columnsValid=true, database.error=null (200)
PASS  health: agency_registrations table present
-- [1] Trilingual registration page
PASS  EN registration page (CTA + partnership disclaimer, 200)
PASS  FR registration page (200)
PASS  AR registration page + RTL (200)
PASS  homepage header CTA present
-- [2] Public submission EN + PDF upload + mass-assignment junk
PASS  submission redirects to success (http 303 → /agency/register/success?ref=AGR-2026-XZUC2H&lang=en);
      mass-assignment junk fields ignored
PASS  success page: review-before-access message + reference (AGR-2026-XZUC2H)
-- [3] Duplicate + invalid-email probes
PASS  duplicate contact email blocked politely (http 200, no success redirect)
PASS  invalid email rejected with localized FR error (http 200)
-- [4] Second submission (AR locale) — subject for the REJECTION path
PASS  AR-locale submission accepted (AGR-2026-8Z7K6B)
-- [5] Anonymous document access denied
PASS  anonymous document download denied (401)
SKIP  (13 staff-side items — needs PREVIEW_VERIFY_STAFF_EMAIL/PASSWORD repo secrets)
-- [11.5] Honeypot + rate limiting
PASS  honeypot submission silently swallowed (no reference issued)
PASS  rate limiting kicks in on rapid repeated submissions
-- [12] Final health re-check
PASS  final health check ok (200)
== Summary ==  PASS: 15  FAIL: 0  SKIP: 13
```

The Preview is seeded with a **non-default** staff password (repo policy: remote demo
seeds refuse default credentials). That secret lives in Vercel env and was never
available to this sandbox — by design. The 13 staff-side hosted checks therefore show
SKIP until the repository secrets `PREVIEW_VERIFY_STAFF_EMAIL` /
`PREVIEW_VERIFY_STAFF_PASSWORD` are set (workflow re-runs on demand). Meanwhile those
exact flows are proven by:

- **Same harness, local hosted run:** identical script against a local Vite-free dev
  build + embedded PG with demo credentials → **PASS 36 / FAIL 0 / SKIP 1** covering
  staff login, pending counter, reference search, review → info-request → approve,
  provisioning, activation link extract from the 303, agency password set → session →
  `/portal`, wallet zero invariant, staff PDF download, anonymous 401, rejection with
  retention + no-account proof, cross-tenant read denial, health re-check.
- **Automated suite:** 115/115 vitest tests on real PostgreSQL 17 incl. the full E2E
  flow with tenant isolation (`tests/registration-e2e.test.ts`).

**Not modified / not deployed:** Production (`visa_os`, production alias, production
build pipeline) — the git integration shipped Preview deployments only, and no merge to
`main` was performed.

---

## 1. Public registration funnel

| Requirement | Implementation | Verified by |
| ----------- | -------------- | ----------- |
| CTA "Register your Agency" / "Inscrire votre agence" / Arabic equivalent in header & nav | `src/app/(public)/layout.tsx` (header + mobile menu, label localized by locale) | curl `/`, `/b2b`: CTA present |
| Homepage hero CTA + B2B section CTA | `src/app/(public)/page.tsx`, `src/app/(public)/b2b/page.tsx` | HTTP 200, links to `/agency/register` |
| Premium `/agency/register` page stating it is an **application for partnership** subject to ESSAFARIA approval (no guaranteed acceptance) | `src/app/(public)/agency/register/page.tsx` + client `registration-form.tsx` | curl EN: *"Register your Agency"* + *"application for partnership"*; FR: *"Inscrire votre agence"* + *"demande de partenariat"*; AR: `سجّل وكالتك` + `dir="rtl"` |
| Full form: company (legal name*, trading name, country*, wilaya/region, city*, address*, business phone*, pro email*, website, commercial registration #*, tax id, licence #) + primary contact (first*, last*, position*, pro email*, phone/WhatsApp*) + business profile (type incl. Travel Agency / Tour Operator / Visa Agency / Corporate Travel / Wholesaler / Other, est. monthly visa volume, destinations, message) | Same page files; field definitions/shared enums in `src/lib/registration-constants.ts`; server schema `registrationSchema` in `src/lib/registrations.ts` | `tests/agency-registration.test.ts` • unit + action tests |
| Documents: commercial registration, licence, tax doc, other — private storage, server-side MIME **and magic-byte** validation, size cap | `agency_registration_documents` table (migration `0003_agency_registrations.sql`), uploaded via the existing storage provider into `agency-registrations/<id>/…`; sniffing in `src/lib/registrations.ts` | `tests/agency-registration.test.ts` — "rejects invalid/oversized/executable uploads"; demo FR registration's PDFs verified downloadable as real `%PDF` bytes |
| Consents: ToS, privacy, accuracy authorization — all required | DB `CHECK` constraint enforces all three `true` (migration 0003) | `tests/agency-registration.test.ts` — "rejecting submissions without required consents" |
| Success screen with exact commitment: *"Your agency registration request has been received. ESSAFARIA TRAVEL will review your information before access to ESSAFARIA VISA OS is activated."* — no acceptance implied; public ref `AGR-YYYY-XXXXXX` shown | `src/app/(public)/agency/register/success/page.tsx` (EN/FR/AR, RTL-ready) | action-redirect test in `tests/registration-e2e.test.ts`; curl AR success page (`تم استلام الطلب`, `dir="rtl"`, ref shown); `ref` param is regex-validated server-side and React-escaped (XSS probe inert) |

## 2. Public-endpoint security

| Requirement | Implementation | Verified by |
| ----------- | -------------- | ----------- |
| Server-side validation (all inputs re-validated; client UI is progressive enhancement only) | Zod `registrationSchema` (localized messages) in `src/lib/registrations.ts`, executed inside `submitRegistrationAction` | `tests/agency-registration.test.ts` — required-fields / invalid-email matrices |
| Malicious-input handling | Names/company/control chars sanitized (`[\u0000-\u001F]` stripped), lengths capped, HTML never interpreted (React rendering only) | "sanitizes malicious input" test (incl. embedded BEL probe injected via `String.fromCharCode`) |
| Rate limiting | In-memory per-IP limiter (burst) **plus** DB-backed hourly/daily ceilings counted from `agency_registrations.createdAt` | "applies rate limiting… (`RATE_LIMITED`)" test |
| Anti-spam / anti-automation | Invisible honeypot field (`fax` — silently accepted without persisting, audited), minimum-fill-time trap, disposable-email/domain heuristics | "blocks honeypot submissions without creating a record" test |
| Duplicate email / company detection | Normalized lowercase email vs `users.email`, live registrations (contact + company email), normalized agency legal/trading names, commercial-registration numbers | "rejects duplicate emails / company identity" tests |
| Safe uploads | Whitelist (pdf/jpeg/png/webp), 10 MB cap, random server-generated object keys, original filename never trusted for the key, private storage, staff-only download route | upload tests + anonymous download returns **401** |
| Safe error responses | Typed error codes (`VALIDATION`, `RATE_LIMITED`, `DUPLICATE_*`, `UPLOAD_*`) + localized messages; no stack traces / DB details leak | action tests assert error envelope shape |
| **Mass-assignment / role-permission injection protection** — public request never sets role, permissions, agencyId, approval status, wallet, credit, internal notes | Insert payload is hand-whitelisted field-by-field; `FormData` entries like `role=SUPER_ADMIN`, `status=APPROVED`, `balance=999`, `agencyId=…` are never read | `tests/registration-e2e.test.ts` "mass-assignment junk is ignored"; `tests/agency-registration.test.ts` injection suite |
| Registration **never auto-activates** | Only `PENDING` rows can be created publicly; activation path requires staff approval + staff-issued activation token | approval-lifecycle tests (detailed below) |

## 3. Admin review surface

| Requirement | Implementation | Verified by |
| ----------- | -------------- | ----------- |
| `Admin → Agency Registrations` area with pending counter | `src/app/admin/registrations/page.tsx`; badge computed via `pendingRegistrationCount()` shown in `src/components/app-shell.tsx` admin nav (defensive `.catch(() => 0)`) | curl list: label + counter + seeded rows (200) |
| Search + filters (company / country / contact / date / status) | `registrationFiltersSchema` + `listRegistrations()` (paginated, `PAGE_SIZE`, wildcard-escaped ILIKE); FilterBar UI | `tests/agency-registration.test.ts` query tests; curl `?status=PENDING` 200 |
| Statuses `PENDING / UNDER_REVIEW / MORE_INFORMATION_REQUIRED / APPROVED / REJECTED` | `REGISTRATION_STATUSES` enum (`registration-constants.ts` → re-exported by `schema.ts`), DB CHECK | schema + workflow tests |
| Detail: company / contact / business / documents / history / internal notes | `src/app/admin/registrations/[id]/page.tsx` (`KeyValue` cards, history timeline incl. internal notes) | curl detail: every section string present; `registre-commerce.pdf` row + **Download** link |
| Actions: Start review / Request more info / Approve / Reject — approve+reject behind confirmation | Server actions in `src/app/actions/registration-admin.ts`; confirmation dialogs (`ConfirmButton`); Approve issues full re-validation before provisioning | workflow tests + curl (all four buttons rendered) |
| Staff-only document access | `src/app/api/registrations/[id]/documents/[docId]/route.ts` — session + `registrations.view` RBAC gate, tenant-agnostic but staff-only | staff 200 w/ `%PDF-1.4` bytes, **anonymous 401** |

## 4. Approval → provisioning (transactional, idempotent, auditable)

| Requirement | Implementation | Verified by |
| ----------- | -------------- | ----------- |
| Approval re-validates server-side before provisioning | `approveRegistration()` re-runs duplicate/conflict probes inside the transaction (with row lock) | "CONFLICT rollback after post-submission email squat" — registration stays `PENDING`, then retry succeeds after cleanup |
| Creates **Agency (existing model)** + first **user `AGENCY_ADMIN`** bound to it; links registration → agency → user; records approver + timestamp | Single DB transaction: `INSERT agencies (ACTIVE, balance "0.00", billingTaxId)` + `INSERT users (role AGENCY_ADMIN, agencyId)` + update registration links (`agencyId`, `decidedBy`, `decidedAt`, status) | `tests/registration-approval.test.ts` provisioning suite — asserts exactly 1 agency / 1 user / binding / links |
| Rollback: failure leaves no partial agency | Conflict throws **before** any commit (`sequentialTransaction`); forced-failure test asserts zero agencies/users/ledger rows | rollback tests (email squat + pre-existing agency-name conflict) |
| Idempotent & concurrency-safe | Second `approveRegistration()` on an already-APPROVED row returns the existing agency (no-op); `Promise.all` concurrent approvals → exactly 1 agency, 1 user, 1 APPROVED history row | "idempotency — repeated approval is a no-op" + "concurrent double-approval creates one agency" |
| Audit + notification on existing rails | `REGISTRATION_APPROVED`, `AGENCY_CREATED`, `USER_CREATED` audit events (actor/IP/UA), `AGENCY_ONBOARDED` notification via existing notifications service | asserted in provisioning tests |
| Unauthorized approval blocked | `registrations.manage` permission: SUPER_ADMIN/ADMIN only — VISA_AGENT / ACCOUNTING / foreign AGENCY_ADMIN → `FORBIDDEN`, registration untouched | authorization suite |
| Rejection: no agency, no portal access, no wallet credit; record retained | Reject path writes status + history + optional reason only; rejected rows remain for audit | review/reject lifecycle tests |
| **Wallet untouched** — registration/approval never creates credit; funding stays ADMIN/ACCOUNTING | No wallet code path exists outside staff adjusters; tests count **0** `wallet_transactions` for the new agency | wallet-ledger zero-join assertion + E2E |

## 5. Activation (no plaintext permanent passwords)

| Requirement | Implementation | Verified by |
| ----------- | -------------- | ----------- |
| Token-based set-password flow on existing auth architecture (like session reset) | `src/lib/account-activation.ts` — opaque token, SHA-256 hash stored (`account_activation_tokens`), 72 h TTL, single-use (`used_at`), issuing a new token revokes earlier unused ones; `/activate/[token]` + `activateAccountAction` + success → session issued → `/portal` | lifecycle tests in `tests/registration-approval.test.ts` (72 h TTL, locale `ar` resolved, `PASSWORD_POLICY` enforced, single-use reuse → `INVALID_TOKEN`, t2 revokes t1, forced expiry, `authenticate()` with new password, audits, `PENDING → INVALID_STATE`) |
| Provisioning never stores a known password | Admin user created with unusable random hash; test proves `authenticate(password="password")` ≠ success until activation | "user has no usable password before activation" |
| Staff issues link from registration detail | "Generate activation link" action (approved rows only), URL rendered with current host headers | curl approved detail: button + link-ready state; token issued live for smoke |

## 6. Multilingual EN / FR / AR (+ RTL)

| Requirement | Implementation | Verified by |
| ----------- | -------------- | ----------- |
| Labels, instructions, validation errors, consent, confirmation & status communication in all three languages | `src/lib/i18n.ts` dictionary (`RegistrationLocale`, `resolveLocale`, `isRtl`) + localized Zod messages; locale persisted on the registration row and drives email/notification copy | curl trilingual public page (EN/FR/AR correct copy, AR root `dir="rtl"`) + AR success page; localized-error assertions in tests |

## 7. Design

| Requirement | Implementation |
| ----------- | -------------- |
| Deep Navy `#0B1F33`, Muted Gold `#B08D57`, Ink `#162033`, ivory/white surfaces, 14 px corners, Aurora typography; premium B2B partnership look | Existing CSS custom properties/Tailwind v4 tokens reused verbatim — no new palette introduced; registration pages share the public shell, `aurora` typography preset and 14 px radii; Brand Studio restyling applies automatically |

## 8. End-to-end flow (documented + automated)

Automated in `tests/registration-e2e.test.ts` and reproducible by hand:

1. **Public**: French applicant submits `submitRegistrationAction(FormData)` with a real PDF
   upload and junk mass-assignment fields (`role`, `status`, `balance`, `agencyId`) →
   `302 → /agency/register/success?ref=AGR-…&lang=fr`; junk fields provably ignored.
2. **Staff review**: `Start review` → `Request more information (fr)` → internal note →
   back under review.
3. **Approve**: SUPER_ADMIN approves → transaction creates ACTIVE agency (balance 0.00)
   + bound `AGENCY_ADMIN`, links everything, audits, notifies.
4. **Activate**: staff generates activation link → agency admin sets password at
   `/activate/<token>` → `evos_session` issued → redirect `/portal`.
5. **Post-login portal**: `getSessionUser()` resolves AGENCY_ADMIN; dashboard renders;
   tenant isolation proven live — Agency B cannot read Agency A's application
   (`NOT_FOUND` cross-tenant), A's staff sees it; wallet balance stays 0, exactly one
   AGENCY_ADMIN exists.

Manual/live corroboration (dev server + embedded PG seeded with the demo catalogue):
FR pending registration `AGR-2026-DJET9D` (2 PDF docs), AR pending `AGR-2026-L5MSNJ`,
EN approved `AGR-2026-DD7BVJ` with live agency — all visible in the admin queue, detail
pages, downloadable documents and approval/activation UI exactly as above.

## 9. Test inventory (new & updated)

| Suite | Covers |
| ----- | ------ |
| `tests/agency-registration.test.ts` | schema/unit validation incl. localized errors; submission action (redirect, consent gate, honeypot, rate limiting, duplicates, mass-assignment, upload sniffing/size); list/search/filter queries |
| `tests/registration-approval.test.ts` | staff authorization; full provisioning; idempotency; concurrent double-approval; conflict rollback ×2; review/info/note/reject/reopen; activation-token lifecycle; DB CHECK enforcement |
| `tests/registration-e2e.test.ts` | the whole public→pending→review→approval→activation→login→portal flow with tenant isolation & wallet integrity |
| `tests/health.test.ts`, `tests/migrations.test.ts` | migration ledger updated for `0003_agency_registrations.sql` |

## 10. Constraint compliance

- ✅ Implemented on the Phase 2 branch/preview only — Production untouched.
- ✅ No parallel agency/auth system: reuses `agencies`, `users`, `user_roles`, sessions,
  scrypt hashing, RBAC permissions, storage provider, notifications, audit log.
- ✅ Nothing destructive: additions only — one migration, new routes/modules; existing
  routes/models preserved and re-exported contracts kept intact (`@/db/schema` still
  re-exports the shared registration enums for server code; client components import the
  dependency-free `src/lib/registration-constants.ts`).
