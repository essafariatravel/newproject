# ESSAFARIA pre-production hardening implementation plan

Baseline: `essafariatravel/newproject`, `design/essafaria-northstar`, `2a4e629fcf4c306dc6a1d85dd27998bf70d92588`.
Isolated branch: `preprod/essafaria-final-hardening`.
Workspace: `work/essafaria-hardening`.

The supplied master brief is the approved specification. Execution is pre-authorized after this plan. This is an architectural hardening task in the existing Next.js/Drizzle/PostgreSQL product. Preserve the approved presentation and existing UUID identities, historical snapshots and immutable financial history. Use focused services and additive migrations, without a new framework.

## Audit findings

- Agency auth selects globally unique email; username identities and recovery are absent.
- Sessions have fixed seven-day expiry; suspension tokens can revive after reactivation.
- Staff user updates lack last-SUPER_ADMIN and privilege-escalation protection.
- Final decision accepts an optional official file; generic status transition exposes bypasses.
- Dashboard attention uses open requests, but notification action filters use historical event types.
- Top-up approval is already transactional and idempotent; payment proof is absent.
- Public homepage and country route expose configured active country availability.
- Initial agency registration requires full KYC and lacks targeted follow-up upload access.
- Wizard has exactly three steps and does not persist pre-confirmation drafts; retain this.
- Legal pages invent a current update date; owner-approved multilingual legal content is missing.
- Preview builds can automatically migrate an unprotected branch; protect this new branch before publication.

## Execution and verification

1. [ ] **Safety and baseline:** verify exact worktree HEAD; protect preproduction builds from automatic DB changes, seeding and bootstrap; run existing tests on a new disposable localhost cluster with supported Node; capture baseline failures honestly.
2. [ ] **Identity foundation:** `schema.ts`, `auth.ts`, `rbac.ts`, auth/admin actions, account/team screens. Add normalized globally unique agency usernames, partial staff-email uniqueness, idle/absolute expiry, transactional revocation, safe account actions, last-SUPER_ADMIN protection, generic recovery request and manual authorized reset queue. Test collision, tenant, role, token and session invariants.
3. [ ] **Critical invariants:** `applications.ts`, documents/actions/detail, `topup.ts`, receipt route/form. Require a persisted official decision file; forbid generic submission/final status bypasses; preserve slot-specific locking/history and current open actions; add secure proof upload to existing exactly-once credit transaction. Test failed upload, request races, terminal queues, tenant file access, wallet and credit retries.
4. [ ] **Agency partnership/public:** registration schema/service/actions/forms and Staff review. Minimal first contact; review states; specific secure follow-up document slots; duplicate assistance without automatic rejection; private catalogue guarded server-side and omitted from public HTML/navigation/metadata; restrained cinematic public content.
5. [ ] **Operations/configuration:** notifications and communications use live actions and per-user reads; inbox context and visibility; dashboard/list navigation and filters; configuration lifecycle/usage/protected primitives; report dates and filters; DZD formatting; safe legal versioning/missing-content states. Test current actions, internal messages, config and report semantics.
6. [ ] **Reset tooling:** dry-run default, dependency inventory, explicit preserved administrator/system records, backup requirement and storage plan; fail closed for remote/production execution. Do not execute any go-live reset.
7. [ ] **Quality gates:** full tests, typecheck, lint, optimized build, migration and concurrency checks; FR/EN/AR and 320/390/768/1440 rendered critical routes, roles, uploads, keyboard and RTL. One restrained polish pass after functional correctness. Independent review and fixes.
8. [ ] **Preview candidate:** logical commits; verify publication; prove project and `visa_os_preview` identity and backup before any hosted migration. Validate exact SHA, health and real hosted flows. Stop before main merge, promotion or Production.

## Safety and release blockers

Production schema `visa_os`, Production environment and `main` are forbidden. Hosted writes require positive project/schema verification and a restore point. No credentials are printed. No reset is executed. Legal text, company facts and authorized go-live staff identities must come from the owner; missing information remains a Production blocker.

## Review focus

- Concurrent reset/decision/top-up retries must yield one valid result or safe rejection.
- Suspended/reactivated users must not regain access via old session or activation tokens.
- Polling must not indefinitely extend unattended sessions.
- Unknown/crafted IDs and direct actions must preserve tenant/privacy policy.
- Historical dossiers must remain readable when catalogue configuration is deactivated.

Progress and exact evidence will be recorded in the final report. An unchecked item is not a completed claim.
