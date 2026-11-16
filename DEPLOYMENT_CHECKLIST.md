# DEPLOYMENT CHECKLIST — ESSAFARIA VISA OS

Work top-to-bottom. Do not skip lines marked **[SECURITY]**.

## A. Before first deploy

- [ ] Repository pushed; `git status` clean; **[SECURITY]** no `.env`, `.env.local`,
      `tests/.pgdata-test/` or secrets anywhere in history (`git log --all --diff-filter=A -- .env*`).
- [ ] `npm ci && npm run lint && npm run typecheck && npm run test && npm run build`
      all pass locally on the commit being deployed.
- [ ] Supabase (or managed PG) project created; region chosen.
- [ ] `DATABASE_URL` (pooled, port 6543) works: `DATABASE_URL=… npm run db:migrate` succeeds.
- [ ] `npm run db:verify` confirms the intended Supabase project, schema, and migration history.
- [ ] Existing business data inspected. Any missing account/configuration creation explicitly approved; no automatic demo seed.
- [ ] Storage decision made: `STORAGE_PROVIDER=db` (default) or `supabase` (+ bucket + service key).

## B. Vercel

- [ ] Project imported from Git; framework preset Next.js; no custom build overrides.
- [ ] **Preview only**: one canonical `DATABASE_URL`, `STORAGE_PROVIDER` (+ Supabase storage vars if used).
      Production unchanged; branch overrides checked. `SESSION_SECRET` / `JWT_SECRET` are not used.
- [ ] **[SECURITY]** Database URI and service-role keys are server-only, never `NEXT_PUBLIC_*`.
- [ ] First deploy succeeds; deployment logs show no warnings about missing env.
- [ ] Custom domain attached; HTTPS active; HTTP→HTTPS redirect works.

## C. Post-deploy verification (run on the actual Preview URL)

- [ ] `/` renders; `/visas` and `/countries` show the live catalogue.
- [ ] `/privacy` and `/terms` render with final legal texts (edit in `/admin/settings`).
- [ ] Login works for one staff account and one agency account.
- [ ] **[SECURITY]** No demo users/passwords inserted into the real database.
- [ ] Login creates a hashed session, updates last_login_at and records USER_LOGIN.
- [ ] No SQL leak, HTTP 500 or database connection errors in actual Preview responses/logs.
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
