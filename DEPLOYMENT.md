# ESSAFARIA — Supabase / Vercel Preview deployment

This is the current deployment guide; it supersedes the older deployment notes in
`FINAL_HANDOFF.md` and `FINAL_ACCEPTANCE.md`. Never run a database reset to deploy.

## Architecture and environment audit

- Next.js server components/actions → Drizzle → `pg.Pool` → PostgreSQL.
- Schema: `src/db/schema.ts`. Migrations: hand-authored SQL in `migrations/`.
  There is no Drizzle Kit config or Supabase JavaScript SDK, and neither is required.
- Authentication: scrypt passwords in `public.users`, random opaque cookies, SHA-256
  token hashes in `public.sessions`. This is not Supabase Auth or JWT authentication.
- `SESSION_SECRET` and `JWT_SECRET` are not consumed by the application.
- Normal queries, auth, settings, seed, documents and catalogue share `src/lib/db.ts`.
- `scripts/migrate.ts` uses the shared connection configuration with an optional DDL URL.
- The legacy `scripts/smoke.ts` uses `DATABASE_URL`, assumes demo accounts and creates
  sessions directly; it does NOT prove password authentication. Do not use it blindly
  against the real database. `scripts/reset.ts` is destructive and is NOT a deployment tool.

| Variable | Requirement / scope |
| --- | --- |
| `DATABASE_URL` | Required server-only PostgreSQL URI; one canonical Preview value. Supabase transaction pooler, port 6543, recommended for Vercel. |
| `MIGRATION_DATABASE_URL` | Optional server-only CLI override for migrations; direct connection or session pooler on 5432. Runtime never reads this override. |
| `STORAGE_PROVIDER` | Optional; defaults to `db` (documents in PostgreSQL). |
| `SUPABASE_URL` | Only required for `STORAGE_PROVIDER=supabase`. HTTPS API URL, NOT a database connection string. |
| `SUPABASE_SERVICE_ROLE_KEY` | Only required for Supabase document storage; server-only. |
| `SUPABASE_STORAGE_BUCKET` | Optional with Supabase storage; defaults to `visa-documents`; bucket must be private. |
| `NODE_ENV`, `VERCEL`, `VERCEL_ENV` | Platform-managed; do not set `NODE_ENV=preview`. Vercel Preview runs Next.js in production mode. |
| `ALLOW_DEMO_SEED`, `SEED_ADMIN_PASSWORD`, `SEED_AGENCY_PASSWORD` | Demo CLI only; never required by the app or normal deployment. |
| `BASE_URL` | Legacy smoke-test CLI only. |

No `NEXT_PUBLIC_*` database password, service key or session/JWT secret is permitted.
Supabase anon/publishable keys and `POSTGRES_*` aliases do not configure this app.
Keep TLS verification enabled and preserve provider-supplied connection options.

## Intended project and Preview configuration

Project reference: `xgetzgixalrsmuvfthpf`.
API URL: `https://xgetzgixalrsmuvfthpf.supabase.co`.
The API URL alone cannot authenticate a PostgreSQL connection. Obtain the actual URI
from this project's Supabase **Connect** dialog; do not guess its pooler hostname/region.

1. Authorize Vercel access and link the existing ESSAFARIA project, not a new project.
2. Inspect environment variable NAMES and scopes without printing values. Select
   **Preview only**. Leave Production unchanged.
3. Update the existing Preview `DATABASE_URL`, or create it once if absent. If a variable
   covers both Preview and Production, preserve Production's value when separating the
   scopes. Check branch-specific overrides as well as project-wide Preview values.
4. Use the transaction-pooler URI (6543) for runtime. The pool uses at most three
   connections per Vercel instance and no named prepared statements.
5. If needed for migration tooling, use the direct URI or session pooler (5432) as
   `MIGRATION_DATABASE_URL`. Direct Supabase hosts may require IPv6. Our runner also
   works on the transaction pooler: it uses one transaction and a transaction-level lock.
6. Do not automatically change storage providers on a database containing documents.
   `db` needs no service-role key; existing Supabase storage requires its existing bucket/key.
7. New environment settings require a new Preview deployment. Do not promote to Production.

Never paste credentials into chat, commit environment files, put them in shell command
arguments, or log their values. `.env.*` and `.vercel/` are ignored (except `.env.example`).

## Safe schema initialization

Load credentials securely into the CLI environment, then:

```sh
npm ci
npm run db:migrate
npm run db:verify
```

Confirm the target before running migrations. If supplying two connection URIs, verify
BOTH refer to `xgetzgixalrsmuvfthpf`. Do not assume a Preview-only Vercel setting means the
database is separate from Production; the real database may be shared.

The runner applies the unchanged repository migrations:

- `0001_init.sql`: 23 application tables including users, agencies, sessions,
  site_settings, countries, visa catalogue/requirements, workflow, applications,
  documents, wallets, notifications, communications and audit logs.
- `0002_branding.sql`: additive agency branding columns.

`public.schema_migrations` tracks applied files. A transaction-level advisory lock
serializes concurrent invocations; SQL and migration history commit atomically. Repeated
runs skip applied files. No reset, truncate, seed, or data deletion occurs. If a database
already has tables but no matching migration ledger, the runner fails safely: inspect
schema/history manually rather than dropping tables or falsely marking migrations applied.

`db:verify` is read-only. It checks the requested project routing, queries all application
columns/tables, reports empty versus populated (no user records), and checks migration
history. A successful build or fallback homepage is NOT proof of a database connection.

## Seed/data decision — approval required

Migrations create structure, not accounts, settings or catalogue records. Existing data
must be inspected first. Demo data is unnecessary if usable staff accounts and business
configuration already exist. An empty database needs an approved staff account and real
configuration; do not automatically substitute demo data.

The existing demo seed would insert currencies, countries, visa categories, document
types, eight sample visa programmes with sample fees/requirements, workflow statuses and
transitions, priorities, sample branding/contact/legal settings, four staff users, two
demo agencies, three agency users, a EUR 2,000 wallet funding entry, one submitted France
application with a fictional applicant, and related checklist/history/ledger/audit/
notification records. It can update existing status definitions. It is not a real-business
onboarding script and is not a fully transactional recovery tool.

It is never run during builds or migrations. Production-mode seeding is blocked; remote
demo seeding additionally requires explicit opt-in and non-default passwords. Do not
bypass the guard for a shared Production database. Nothing has been seeded into Supabase
by these repository changes.

## Live acceptance (must be done on the actual Preview URL)

1. Confirm Vercel reports a successful **Preview** deployment for the pushed commit.
2. GET `/`, `/login`, `/visas`, `/countries`: correct app content; no Vercel protection
   screen mistaken for the application, no 500 or SQL/connection error text.
3. Verify populated catalogue and settings against the read-only database check, not
   fallback branding or empty-state HTML.
4. With an authorized staff account, submit the actual login form. Confirm secure,
   HttpOnly session cookie; authenticated `/admin`, settings and catalogue routes.
5. In the database, confirm the corresponding hashed session, updated `last_login_at`,
   and `USER_LOGIN` audit record. Then confirm the session persists on a second request.
6. Verify an authorized agency account can use `/portal`, cannot access staff data, and
   cannot access another agency's records. Unauthenticated routes redirect to `/login`.
7. Check deployment logs for database errors and scan delivered frontend assets for
   actual credential values without printing the values. Do not expose a public
   diagnostic endpoint or bypass Preview deployment protection.

Local automated tests use a separate embedded PostgreSQL database only. They verify
migration idempotence/rollback/concurrency, password login, session lookup, last-login
updates, audit records, tenant isolation and safe login error messages. They do not
replace the above Supabase/Preview acceptance checks.
