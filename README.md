# ESSAFARIA VISA OS

A premium B2B visa-operations platform for **ESSAFARIA TRAVEL** — public marketing site,
staff Back Office for the full visa case lifecycle, and a self-service Agency Portal with
prepaid wallets. Built as a single Next.js application with strict server-side enforcement
of every business rule.

## Stack

| Layer      | Choice                                                      |
| ---------- | ----------------------------------------------------------- |
| Framework  | Next.js 16 (App Router, Server Components, Server Actions)  |
| Language   | TypeScript (strict + `noUncheckedIndexedAccess`)            |
| Styling    | Tailwind CSS v4                                             |
| Database   | PostgreSQL (Supabase or any managed PG)                     |
| ORM        | Drizzle ORM, hand-written SQL migrations                    |
| Auth       | scrypt password hashing + opaque server-side sessions       |
| Storage    | PostgreSQL `bytea` (default) or Supabase Storage            |
| Tests      | Vitest against a real embedded PostgreSQL 17                 |

Deliberately minimal dependencies. **No Gmail integration, no AI features, no payment
gateway** — these are documented as future work in `FINAL_HANDOFF.md`.

## Quick start

```bash
npm install
cp .env.example .env.local          # edit local DATABASE_URL
npm run db:migrate                  # apply migrations
npm run db:seed                     # demo catalogue + demo users
npm run dev                         # http://localhost:3000
```

`npm run db:up` starts a local throwaway PostgreSQL 17 (no Docker needed) if you do not
have one. `npm run db:reset` is destructive and is for disposable local databases only.
For real Supabase/Vercel deployments use [DEPLOYMENT.md](DEPLOYMENT.md) — never reset a
real database; demo-seeding a Preview is strictly opt-in (`ALLOW_DEMO_SEED`, see
DEPLOYMENT.md) and blocked for Production.

### Seeded demo accounts (development only)

| Role         | Email                          | Password (default)    |
| ------------ | ------------------------------ | --------------------- |
| SUPER_ADMIN  | `superadmin@essafaria.example` | `Admin!2345`          |
| ADMIN        | `admin@essafaria.example`      | `Admin!2345`          |
| VISA_AGENT   | `agent@essafaria.example`      | `Admin!2345`          |
| ACCOUNTING   | `accounting@essafaria.example` | `Admin!2345`          |
| AGENCY_ADMIN | `admin@horizonvoyages.example`  | `Agency!2345`         |
| AGENCY_USER  | `user@atlascgroup.example`     | `Agency!2345`         |

> Never use these demo accounts on a real database. Do not run `db:reset` against
> Supabase. Existing account passwords must be changed through the Back Office.

## What's inside

### Public website & agency onboarding
`/` `/visas` `/countries` `/about` `/contact` `/b2b` `/login` `/privacy` `/terms` — visa
catalogue rendered from the live configuration database.

Agencies apply from **"Register your Agency"** (`/agency/register`, trilingual EN/FR/AR
RTL): company + primary contact + business profile + documents (private storage) +
consents, with honeypot/rate-limit/duplicate protection. Every application is reviewed
by staff in **Admin → Agency Registrations** — approval transactionally provisions the
agency + first `AGENCY_ADMIN` and issues a single-use activation link (set-password);
rejection keeps the record for audit. Registration never grants access by itself.

### White-label branding (Brand Studio, `/admin/settings`)
The super admin can restyle the **entire platform** live from the Back Office — no rebuild, no code:
- **Colors**: primary / accent / ink drive the whole UI via CSS custom properties (Tailwind v4 tokens are re-tinted at runtime, including gradients, badges and charts).
- **Logo**: upload a PNG/JPEG/WebP (≤2 MB) shown on the public site, portals and sign-in; remove to restore the built-in monogram.
- **Shape**: corner style presets (soft pills / balanced / crisp editorial).
- **Typography**: aurora (rounded sans + display serif) / modern sans / classic serif.
- **Identity & content**: brand name, tagline, contact details, social links, legal copy.
- A live preview renders buttons, badges, cards and progress in the chosen palette before saving.

Every **agency gets its own logo too** — uploaded by staff on the agency page (or by the
agency's own admin from the portal profile) and displayed across the Agency Portal.
All branding changes are audited; logo storage uses the same pluggable provider as documents.

### Admin Back Office (`/admin`, staff roles)
- Dashboard, applications (search / filter / paginate), applicant & document queues
- Full DB-driven visa configuration: countries, visa categories, visa types (+ fees,
  processing times, document requirements), document types, currencies, statuses,
  transitions, priorities
- Agencies & agency users (create/suspend/reset), staff user management
- **Agency Registrations queue** (`/admin/registrations`): pending counter, search,
  status filters, internal notes, document preview/download, Start review → Approve /
  Reject / More information required — approve+reject behind confirmation
- Wallet & billing: manual CREDIT/DEBIT adjustments with mandatory reason, full ledger
- Communications (per-application threads, internal vs agency-visible), notifications,
- Reports from real data, audit log of sensitive actions, site settings/CMS

### Agency Portal (`/portal`, agency roles)
- Dashboard, application wizard (country → category → type → applicants → documents → submit)
- Document upload/replacement, checklist progress, live submission gate
- Prepaid wallet (balance, top-up instructions), transaction ledger
- Notifications, per-application messages, profile

## Core mechanics (all enforced server-side)

- **Multi-tenant isolation** — every query is scoped by the session's `agencyId`;
  cross-agency access returns `404` (IDOR-safe). Verified by tests.
- **Historical integrity** — applications snapshot country/category/type/fee/currency/
  processing times at creation; later config changes never rewrite submitted applications.
  Deactivation is preferred over destructive deletes.
- **Submission gate** — an agency cannot submit until every *required* document is
  uploaded; staff can override with a mandatory reason (≥10 chars), which is audited.
- **Prepaid wallet** — submission atomically debits the wallet in one SQL transaction
  (`UPDATE … WHERE balance >= amount RETURNING`), writes a ledger row with balance
  before/after, and a partial unique index guarantees **one charge per application**
  even under concurrent double-submits. Wallets can never go negative (DB constraint).
- **Workflow** — status transitions are DB-configured (from/to/scope); invalid
  transitions are rejected; every change writes status history + notifications + audit.
- **Documents** — 10 MB limit, MIME whitelist (pdf/jpeg/png/webp/doc/docx), versioned,
  tenant-verified download path; review actions are staff-only with mandatory reason.
- **Agency registration** — public submissions are whitelisted server-side (mass-assignment
  safe by construction), honeypot + in-memory rate limit, normalized-email/company
  duplicate detection, sanitized names (control chars stripped); approval runs in **one
  transaction** (agency + admin user + history + audit + notification + links) and is
  idempotent — concurrent or repeated approvals create exactly one agency. Registration
  never sets roles, agency ids, approval state, or wallet balance.
- **Audit log** — sensitive actions (auth events, wallet moves, overrides, config edits,
  reviews) are recorded with actor, IP and user agent. Recording never breaks a request.
- **Communications** — per-application threads with `INTERNAL` (staff-only) vs `AGENCY`
  (visible to the agency) visibility.

## Scripts

| Command              | Purpose                                              |
| -------------------- | ---------------------------------------------------- |
| `npm run dev`        | Dev server (localhost:3000)                          |
| `npm run build`      | Production build                                     |
| `npm start`          | Production server (`PORT` env, default 3000)         |
| `npm run test`       | Vitest suite against embedded PostgreSQL 17          |
| `npm run typecheck`  | `tsc --noEmit`                                       |
| `npm run lint`       | ESLint (flat config)                                 |
| `npm run db:migrate` | Apply `migrations/*.sql`                             |
| `npm run db:seed`    | Seed catalogue + demo users                          |
| `npm run db:reset`   | Migrate + seed from scratch                          |
| `npm run db:up`      | Start local PostgreSQL 17 for development            |
| `npx tsx scripts/smoke.ts` | Authenticated HTTP smoke test against a running server |

## Testing

115 tests across 20 suites run against a **real PostgreSQL 17** (embedded, ephemeral):
auth, RBAC, tenant isolation (A→B denied), wallet ledger integrity, submission gate +
charging, concurrency (parallel submits cannot overdraw; duplicate submits charge once),
status workflow, document lifecycle, config snapshot integrity, audit logging —
plus the **agency registration & approval lifecycle**: public submission validation,
honeypot/rate-limit, duplicate detection, role-injection rejection, document-upload
validation, staff authorization, transactional agency provisioning, idempotent approval,
conflict rollback, activation-token security and a full end-to-end onboarding flow.

```bash
npm run test
```

## Project layout

```
src/
  app/            routes: public, agency/register, admin/, portal/, activate/[token], api/…
    actions/      "use server" action modules (auth, admin, applications, config, documents,
                  communications, registrations, activation, registration-admin)
  components/     UI kit, application detail, shell/nav
  db/             schema.ts (Drizzle) — migrations in migrations/
  lib/            auth, rbac, wallet, applications, documents, queries, audit, settings, storage,
                  registrations, i18n, account-activation, registration-constants…
tests/            vitest suites + embedded-PG harness (helpers/)
scripts/          migrate / seed / reset / dev-db / smoke
```

See `DEPLOYMENT.md` for production deployment, `DEPLOYMENT_CHECKLIST.md` for the go-live
checklist, `FINAL_ACCEPTANCE.md` for feature-by-feature verification and `FINAL_HANDOFF.md`
for the handover summary.
