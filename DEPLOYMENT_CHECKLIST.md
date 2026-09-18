# DEPLOYMENT CHECKLIST — ESSAFARIA VISA OS

Work top-to-bottom. Do not skip lines marked **[SECURITY]**.

## A. Before first deploy

- [ ] Repository pushed; `git status` clean; **[SECURITY]** no `.env`, `.env.local`,
      `tests/.pgdata-test/` or secrets anywhere in history (`git log --all --diff-filter=A -- .env*`).
- [ ] `npm ci && npm run lint && npm run typecheck && npm run test && npm run build`
      all pass locally on the commit being deployed.
- [ ] Supabase (or managed PG) project created; region chosen.
- [ ] `DATABASE_URL` (pooled, port 6543) works: `DATABASE_URL=… npm run db:migrate` succeeds.
- [ ] Seed executed with production-intent passwords:
      `SEED_ADMIN_PASSWORD=<secret> SEED_AGENCY_PASSWORD=<secret> DATABASE_URL=… npm run db:seed`
- [ ] `SESSION_SECRET` generated (`openssl rand -base64 48`) and stored in the password manager.
- [ ] Storage decision made: `STORAGE_PROVIDER=db` (default) or `supabase` (+ bucket + service key).

## B. Vercel

- [ ] Project imported from Git; framework preset Next.js; no custom build overrides.
- [ ] Environment variables set for **Production** and **Preview**: `DATABASE_URL`,
      `SESSION_SECRET`, `STORAGE_PROVIDER` (+ Supabase vars if used).
      **[SECURITY]** `SESSION_SECRET` is unique per environment and never reused from dev.
- [ ] First deploy succeeds; deployment logs show no warnings about missing env.
- [ ] Custom domain attached; HTTPS active; HTTP→HTTPS redirect works.

## C. Post-deploy verification (run on the production URL)

- [ ] `/` renders; `/visas` and `/countries` show the live catalogue.
- [ ] `/privacy` and `/terms` render with final legal texts (edit in `/admin/settings`).
- [ ] Login works for one staff account and one agency account.
- [ ] **[SECURITY]** All seeded demo passwords changed (`/admin/users`).
- [ ] Staff: create/inspect one application through the full lifecycle
      (submit → documents → review → decision) on a test agency.
- [ ] Agency: submit an application with missing required document → blocked;
      upload → gate passes; submit → wallet debited once; ledger shows before/after.
- [ ] **[SECURITY]** Cross-tenant probe: log in as agency B, request agency A's
      application/document URL → `404`, not data.
- [ ] **[SECURITY]** Agency user opening `/admin/*` is redirected (no staff UI exposure).
- [ ] Wallet top-up performed by ACCOUNTING with reason; entry visible in ledger + audit.
- [ ] Notification appears for the opposite side after submit/review/message.
- [ ] Document upload of an >10 MB file or disallowed type is rejected with a clean error.
- [ ] `/admin/settings` branding changes reflect on the public site (after cache expiry).

## D. Operations

- [ ] Backups verified (Supabase PITR/daily, or external `pg_dump` cron).
- [ ] Uptime monitoring or external probe on `/` (any synthetic monitor).
- [ ] Vercel project members limited to the operations team; 2FA enforced on the Vercel
      and Supabase accounts. **[SECURITY]**
- [ ] Incident contact + procedure documented internally.
- [ ] This checklist archived with the deployment date and deployer in the release notes.
