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
cp .env.example .env.local          # edit DATABASE_URL + SESSION_SECRET
npm run db:migrate                  # apply migrations
npm run db:seed                     # demo catalogue + demo users
npm run dev                         # http://localhost:3000
```

`npm run db:up` starts a local throwaway PostgreSQL 17 (no Docker needed) if you do not
have one. `npm run db:reset` re-applies migrations and re-seeds.

### Seeded demo accounts (development only)

| Role         | Email                          | Password (default)    |
| ------------ | ------------------------------ | --------------------- |
| SUPER_ADMIN  | `superadmin@essafaria.example` | `Admin!2345`          |
| ADMIN        | `admin@essafaria.example`      | `Admin!2345`          |
| VISA_AGENT   | `agent@essafaria.example`      | `Admin!2345`          |
| ACCOUNTING   | `accounting@essafaria.example` | `Admin!2345`          |
| AGENCY_ADMIN | `admin@horizonvoyages.example`  | `Agency!2345`         |
| AGENCY_USER  | `user@atlascgroup.example`     | `Agency!2345`         |

> Change all seeded passwords before any real deployment (`npm run db:reset` after editing
> `SEED_*_PASSWORD`, or update the users from the Back Office).

## What's inside

### Public website
`/` `/visas` `/countries` `/about` `/contact` `/b2b` `/login` `/privacy` `/terms` — visa
catalogue rendered from the live configuration database.

### Admin Back Office (`/admin`, staff roles)
- Dashboard, applications (search / filter / paginate), applicant & document queues
- Full DB-driven visa configuration: countries, visa categories, visa types (+ fees,
  processing times, document requirements), document types, currencies, statuses,
  transitions, priorities
- Agencies & agency users (create/suspend/reset), staff user management
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

61 tests across 11 suites run against a **real PostgreSQL 17** (embedded, ephemeral):
auth, RBAC, tenant isolation (A→B denied), wallet ledger integrity, submission gate +
charging, concurrency (parallel submits cannot overdraw; duplicate submits charge once),
status workflow, document lifecycle, config snapshot integrity, audit logging.

```bash
npm run test
```

## Project layout

```
src/
  app/            routes: public, admin/, portal/, api/documents/[id]
    actions/      "use server" action modules (auth, admin, applications, config, documents, communications)
  components/     UI kit, application detail, shell/nav
  db/             schema.ts (Drizzle) — migrations in migrations/
  lib/            auth, rbac, wallet, applications, documents, queries, audit, settings, storage…
tests/            vitest suites + embedded-PG harness (helpers/)
scripts/          migrate / seed / reset / dev-db / smoke
```

See `DEPLOYMENT.md` for production deployment, `DEPLOYMENT_CHECKLIST.md` for the go-live
checklist, `FINAL_ACCEPTANCE.md` for feature-by-feature verification and `FINAL_HANDOFF.md`
for the handover summary.
