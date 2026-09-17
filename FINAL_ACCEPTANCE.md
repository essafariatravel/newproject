# FINAL ACCEPTANCE — ESSAFARIA VISA OS

Legend: **YES** = verified in this workspace by an automated test or repeatable command.
**NOT VERIFIED** = implemented but not exercised against a live external system here.
Nothing is marked YES on trust. Evidence commands are runnable from the repo root.

| AREA | FEATURE | STATUS | EVIDENCE | NOTES |
|------|---------|--------|----------|-------|
| Validation | TypeScript strict compile (incl. tests) | YES | `npx tsc --noEmit` → clean | strict + noUncheckedIndexedAccess |
| Validation | Production build | YES | `npm run build` → success | Next.js 16, all 40+ routes prerendered/compiled |
| Validation | Lint | YES | `npm run lint` → 0 problems | ESLint 9 flat config, typescript-eslint recommended |
| Validation | Dependency audit | YES | `npm audit` → `found 0 vulnerabilities` | 2026-09-17 |
| Tests | Test suite on real PostgreSQL | YES | `npx vitest run` → **11 files / 61 tests passed** | embedded PostgreSQL 17.10, per-suite reset |
| Auth | Password hashing (scrypt, per-user salt), constant-time verify | YES | tests/auth.test.ts | no plaintext at rest |
| Auth | Opaque server-side sessions, token stored only as SHA-256 hash | YES | tests/auth.test.ts "stores only the hash" | cookie `evos_session`, 7-day expiry |
| Auth | Case-insensitive login, wrong-password & unknown-email rejection | YES | tests/auth.test.ts | safe generic errors |
| Auth | Suspended user / suspended agency blocks login | YES | tests/auth.test.ts | enforced in `authenticate()` |
| RBAC | 6 roles; permission map; staff vs agency separation | YES | tests/rbac.test.ts | SUPER_ADMIN, ADMIN, VISA_AGENT, ACCOUNTING, AGENCY_ADMIN, AGENCY_USER |
| RBAC | Wallet adjust limited to SUPER_ADMIN/ADMIN/ACCOUNTING | YES | tests/rbac.test.ts | enforced in action + service |
| RBAC | Document review staff-only; config staff-only; privilege-escalation via crafted auth objects rejected | YES | tests/rbac.test.ts | `requirePermission` |
| Multi-tenancy | Agency A cannot read agency B application (IDOR → 404) | YES | tests/tenant-isolation.test.ts + HTTP smoke | server-enforced scoping, not UI hiding |
| Multi-tenancy | Cross-tenant document download denied; transactions/balance invisible cross-agency; fabricated IDs rejected | YES | tests/tenant-isolation.test.ts + smoke | 404-equivalent semantics |
| Application | Draft → applicants → checklist generated from visa_requirements | YES | tests/submission.test.ts | checklist resync for DRAFTs on config change |
| Application | Immutable config snapshot (fee, currency, processing times, names) at creation | YES | tests/config-snapshot.test.ts | later config edits never touch existing apps |
| Submission gate | Agency blocked while required docs missing; passes when uploaded | YES | tests/submission.test.ts | server-side gate in `submitApplication` |
| Submission gate | Staff override with reason ≥10 chars, audited; agency can NEVER override | YES | tests/submission.test.ts | audit row written with reason |
| Wallet | Atomic server-side debit on submit (single SQL tx, `WHERE balance >= amount`) | YES | tests/wallet.test.ts + submission.test.ts | no client-supplied amounts anywhere |
| Wallet | One charge per application under concurrent duplicate submits | YES | tests/concurrency.test.ts | partial UNIQUE index on `APPLICATION_CHARGE(application_id)` |
| Wallet | N=10 parallel submissions cannot overdraw; exact successful-charge accounting | YES | tests/concurrency.test.ts | real PostgreSQL row locking; final balance equals invariant |
| Wallet | DB CHECK constraint blocks negative balances at the lowest level | YES | tests/wallet.test.ts | `agencies_balance_nonnegative` |
| Wallet | Manual CREDIT/DEBIT by authorized roles with mandatory reason; ledger with balance before/after | YES | tests/wallet.test.ts | `wallet_transactions` chain verified |
| Workflow | Status transitions DB-configured; invalid transitions rejected | YES | tests/status.test.ts | `status_transitions` table (from,to,scope) |
| Workflow | Full lifecycle SUBMITTED→…→COMPLETED with history, audit, notifications | YES | tests/status.test.ts + audit.test.ts | `application_status_history` |
| Documents | Upload limits (10 MB, MIME whitelist, filename rules); checklist-tied | YES | tests/documents.test.ts | rejects disallowed MIME, oversize, traversal |
| Documents | Versioned replacement; staff review (accept/reject, reason ≥5); tenant-verified download | YES | tests/documents.test.ts + smoke | storage `db` provider on PG bytea |
| Documents | Supabase Storage provider | NOT VERIFIED | code path exists (`src/lib/storage.ts`) | requires real Supabase bucket; default `db` provider fully verified |
| Audit | Sensitive actions recorded (actor, role, IP, UA); never breaks the request | YES | tests/audit.test.ts | FK error path swallowed by design |
| Communications | Per-application threads; INTERNAL vs AGENCY visibility | YES | smoke + portal page | agency sees AGENCY-only rows (query-level filter) |
| Notifications | Real-event notifications (submit, review, decision, wallet, messages) | YES | exercised by lifecycle test + smoke pages | in-app only; no email by design |
| Reports | Reports from real data (volumes, decisions, revenue) | YES | `/admin/reports` smoke 200 | aggregates over live tables, no fixtures |
| Search | Server-side search/filter/pagination (applications, users, docs, ledger, audit) | YES | page smoke 200s + query tests | PAGE_SIZE 20 |
| CMS/Settings | Site settings/branding DB-driven | YES | `/admin/settings` + public render | seed-provided defaults |
| Security headers | X-Frame-Options DENY, nosniff, no-store on app areas | YES | smoke (headers asserted) | next.config.ts |
| HTTP smoke | All public/admin/portal pages, tenant probes, UUID guards | YES | `npx tsx scripts/smoke.ts` → all pass | run against `next start` production build |
| Production deploy (Vercel) | Real deployment | NOT VERIFIED | `DEPLOYMENT.md` prepared | intentionally not auto-deployed, per instruction |
| Supabase managed PG | Managed-cloud connection | NOT VERIFIED | pooled-URL instructions in `DEPLOYMENT.md` | all DB verification used real local PostgreSQL 17 |
| Outbound email (Gmail/SMTP) | — | FUTURE | — | excluded by requirement; notifications are in-app |
| AI features | — | FUTURE | — | excluded by requirement |
| Payment gateway | — | FUTURE | — | excluded by requirement; wallet is manually funded |
| Load/performance testing | — | NOT VERIFIED | — | correctness under concurrency verified; capacity planning not in scope |
| Backup/restore drill | — | NOT VERIFIED | documented in `DEPLOYMENT.md` §6 | operator task post-deploy |

## Reproduce the evidence

```bash
npm ci
npm run lint && npm run typecheck && npm run test && npm run build
npm audit
npm run db:up && npm run db:migrate && npm run db:seed   # local dev DB
npm start &                                               # production build
npx tsx scripts/smoke.ts
```
