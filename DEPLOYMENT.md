# DEPLOYMENT — ESSAFARIA VISA OS on Vercel

This application deploys to Vercel as a standard Next.js 16 project with a managed
PostgreSQL database (Supabase recommended). Follow every step; do not skip the checklist
in `DEPLOYMENT_CHECKLIST.md`.

## 0. Prerequisites

- A Vercel account (Pro or higher recommended for production workloads).
- A Supabase project (or any managed PostgreSQL 14+).
- Node.js 20+ locally.
- This repository pushed to GitHub/GitLab/Bitbucket. **Verify no `.env*` file is committed.**

## 1. Database (Supabase)

1. Create a project in Supabase; wait for it to be provisioned. Note the region — pick the
   one closest to your users.
2. Go to **Project Settings → Database → Connection string → URI** and copy the
   **connection pooling** string (port `6543`). It looks like:
   ```
   postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
   ```
3. From your machine, apply the schema and seed data:
   ```bash
   DATABASE_URL="<pooled-url>" npm run db:migrate
   DATABASE_URL="<pooled-url>" npm run db:seed
   ```
   `db:seed` creates the demo/starter accounts listed in `README.md`. **Change their
   passwords immediately after first login** (or re-seed with your own `SEED_*_PASSWORD`
   values before running it).

> The app uses one pool of plain PG connections; the transaction-mode pooler (6543) is fine.
> Do **not** use the direct (5432) URL in Vercel — connection counts will exhaust.

## 2. Document storage

Two supported providers (chosen by `STORAGE_PROVIDER`):

- `db` (default, zero-setup): documents are stored as `bytea` in PostgreSQL with a
  `document_blobs` table. Works on Supabase out of the box. Suitable up to moderate
  volumes; remember Supabase DB size limits.
- `supabase`: create a **private** bucket (e.g. `visa-documents`) and a service role key.
  The app uploads/downloads server-side only; clients never get bucket URLs.

Start with `db`; switching later is a one-line env change plus a data migration.

## 3. Vercel project

1. Push this repository to your Git provider.
2. In Vercel: **Add New → Project → Import** the repository.
3. Framework preset: **Next.js** (build `next build`, install `npm ci`). Defaults are fine.
4. Set **Environment Variables** (Production *and* Preview):

   | Variable                    | Value                                                        |
   | --------------------------- | ------------------------------------------------------------ |
   | `DATABASE_URL`              | Supabase **pooled** URI from step 1                           |
   | `SESSION_SECRET`            | `openssl rand -base64 48` — long random string                |
   | `STORAGE_PROVIDER`          | `db` (or `supabase`)                                          |
   | `SUPABASE_URL`              | only if `STORAGE_PROVIDER=supabase`                           |
   | `SUPABASE_SERVICE_ROLE_KEY` | only if `STORAGE_PROVIDER=supabase` (server-side, secret)     |
   | `SUPABASE_STORAGE_BUCKET`   | only if `STORAGE_PROVIDER=supabase` (e.g. `visa-documents`)   |
   | `NODE_ENV`                  | `production` (Vercel sets this automatically)                 |

5. Deploy. First deploy compiles from scratch (~2–3 minutes).

## 4. Post-deploy verification

1. Open `https://<your-domain>/` — homepage renders.
2. Log in at `/login` with a seeded staff account; confirm `/admin` loads.
3. Change the seeded passwords (Back Office → Users).
4. In Site Settings (`/admin/settings`) set the production site name/branding and disable
   any demo content if configured.
5. Run through `DEPLOYMENT_CHECKLIST.md` end-to-end on production.

## 5. Domain, HTTPS and email

- Add your custom domain in **Vercel → Settings → Domains**; HTTPS is automatic.
- The contact form stores enquiries as notifications/communications inside the app. There
  is **no outbound email integration by design** (no SMTP/Gmail). Staff monitor the Back
  Office notification centre. If you later add transactional email, it is future work.

## 6. Backups & operations

- Supabase performs automatic daily backups on paid plans — verify and, if needed, add
  `pg_dump` cron: `pg_dump "$DATABASE_URL" > backup-$(date +%F).sql`.
- Monitor: Vercel Analytics / logs; Supabase → Database → Logs.
- Database migrations are plain SQL files under `migrations/`; new ones are applied with
  `npm run db:migrate` (idempotent tracking table `schema_migrations`).

## 7. Rollback

Redeploy the previous Git commit in Vercel (Deployments → … → Promote). Migrations are
additive; rolling back app code does not require rolling back the schema.

## Explicitly out of scope for deployment

- **No payment gateway** — wallets are funded manually by ACCOUNTING staff; no PCI scope.
- **No Gmail/SMTP integration** — notifications are in-app only (FUTURE work).
- **No AI features** — none included (FUTURE work).
