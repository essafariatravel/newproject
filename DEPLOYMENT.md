# ESSAFARIA deployment — verified 20 September 2026

Production: https://newproject-psi-murex.vercel.app
Vercel project: newproject (prj_0WOxlorbYiljjjBvZ1Cm6M9JmPdp).
Supabase: xgetzgixalrsmuvfthpf.

## Database isolation

The existing public schema belongs to a different application. Its users table does not implement Visa OS authentication. Never reset or retrofit it.
Production uses DATABASE_SCHEMA=visa_os; Preview uses visa_os_preview. All ORM and raw queries explicitly qualify their tables, including on transaction pooler connections. Keep these schemas private, outside the Supabase Data API.

DATABASE_URL is configured in both Vercel environments. The verified endpoint is the Supabase transaction pooler on port 6543. Default Supabase TLS verifies hostnames and the certificate chain using system roots plus the bundled public Supabase Root 2021 CA. Certificate verification is not disabled.

Preview builds run advisory-lock-protected migrations and schema verification. Configured database failures stop Preview deployment. Production migrations are explicit operations; Production builds never migrate or seed.

## Production provisioning

Migrations 0001 and 0002 were applied to the isolated schema. A separate administrator account was created for the existing owner, admin@essafaria.com. Its new password is in the private handoff file, not in this repository. Legacy credentials were not changed. Authentication uses scrypt and opaque sessions, not Supabase Auth.

The published legacy catalogue was copied read-only: 36 entries, 24 active with confirmed prices, 24 countries and 117 document requirements. Twelve entries without prices remain inactive; their zero placeholder must not be treated as a confirmed price. Unpublished/B2B-only legacy offerings were not copied. Unknown processing estimates are zero/zero and displayed as On request. Duration and validity descriptions were preserved without turning them into invented processing estimates. Real company contact details were copied.

No legacy dossiers, agency accounts, wallet balances or documents were migrated. New agency onboarding is available to the administrator. Demo users, applications and wallet credits exist only in Preview.

## Verification and subsequent deployments

Check /api/health: require ok=true, schema.columnsValid=true, intended project true and database.error=null. HTTP 200 alone is insufficient. Then verify staff/agency authentication, catalogue pages, uploads and tenant restrictions.

Create staged Production builds with vercel deploy --prod --skip-domain, verify them, then promote the exact deployment. Roll back by promoting a prior known-good deployment; do not reset the database.

The repair was deployed with an authenticated Vercel CLI. The GitHub integration rejects repository writes (403), so repaired commits remain in the local repair branch and supplied source archive/patch. Synchronize these changes before the next Git-triggered deployment, which could otherwise restore old code.

The source archive excludes environment files, credentials, node_modules and local databases. Older FINAL_* handoffs are historical; this document supersedes their deployment status claims.
