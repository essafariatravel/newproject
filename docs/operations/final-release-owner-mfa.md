# Final release and owner MFA — prepared, not armed

Owner decision, 19 October2026: Vercel Pro and Supabase Pro are active. An additional independent restore is removed from the general Go-Live prerequisites. Physical daily backups are the selected recovery basis. This decision is not a claim of RESTORE_PASS and does not authorize migration, account changes, publication or bypass of existing executable guards. No additional project is to be created.

## Exact release boundary

Production remains project `xgetzgixalrsmuvfthpf`, schema `visa_os`, source deployment `831607a2ed0423d575d693b8f8f3a9dfc1e5d9d1`. Read-only recheck on19October confirms ledger0001–0019, two active historical SUPER_ADMIN, no owner account and no MFA tables. Do not replace this baseline with a Preview database or automatically adopt a new baseline candidate.

The current application needs0020–0033 for identity/security, operations, immutable provenance and MFA. Full approved legal acceptance additionally needs0035; the prepared complete candidate chain includes0034 before0035.0034 creates disabled retention controls/evidence only: it neither enables J+120 execution nor qualifies hosted purge.0036 remains an excluded proposal, not a prerequisite of the DB-backed pilot and not part of this release plan. External durable Storage rollout still has its separate qualification gate.

| Batch | Exact files, ascending order | Purpose / state |
|---|---|---|
| A |0020_identity_security;0021_business_invariants;0022_registration_review;0023_operations_legal;0024_preview_api_lockdown;0025_legal_privacy_readiness;0026_function_privilege_hardening;0027_document_integrity;0028_file_identity_hardening;0029_legacy_reconciliation;0030_reconciliation_api_lockdown;0031_reconciliation_event_sequence_repair;0032_privileged_mfa;0033_rule_provenance_and_bounded_history |14 SQL files; existing qualified scope supports explicit0020–0033 authorization, default scope remains0020–0031. |
| B | candidates/0034_document_retention.sql; candidates/0035_legal_document_kinds.sql |2 candidate SQL files, excluded from root discovery and not accepted by the current release approval validator. |

Exact filenames, Git blobs, canonical Git SHA-256 and local worktree SHA-256 are recorded in the private task's release manifest. The approved digest must match the actual executor checkout bytes; Windows CRLF hashes must not be substituted for a Linux checkout's canonical hashes.

## Existing guard conflict — explicit replacement approval required

`scripts/prod-release.ts::loadApplyAuthorization` still requires a verified DR manifest/bundle and independent-custody receipt. `scripts/lib/release-safeguards.ts` accepts exactly0020–0033. The current workflow stages those DR inputs. Do not create fake receipts, claim a physical backup is an independently restored dump, inject dummy digests, add PROD_GO or run migrate.ts directly to evade these conditions.

The targeted policy change to approve before implementation/arming is:

1. Add an explicit owner-selected managed-backup approval policy alongside the existing strict DR policy; preserve the existing policy for approvals that select it. Bind the exact owner decision, project, database, candidate/source SHA and migration file hashes to a verifiable successful physical backup reference (provider ID if exposed, otherwise project/displayed timestamp/type with a private evidence capture), its real completion status and retention expiry. Do not relabel the displayed timestamp as completion time without evidence.
2. Require a private capture of backup metadata from the correct project, a reviewed maximum rollback gap, and explicit acknowledgement that a physical restore affects the whole database, not only visa_os. Storage file bytes remain outside database backups; preserve their separately mapped source and do not claim coverage from Storage metadata.
3. Extend only the reviewed target set to0035, with candidates copied into an exact temporary release input, not enabled globally or automatically. Preserve exact baseline checks, digest checks, maintenance/drain proof, identity, advisory locks, protected restore points, original-content comparisons, audit, transactional postflight and full rollback on error. Exclude0036 and every unlisted file.
4. Keep the apply path unreachable until a fresh exact-SHA owner publication/migration approval selects this policy and binds these real inputs. This document does not implement or activate that change.

The owner has approved the general policy decision; the exact security-sensitive code delta above is the remaining targeted decision. Independent restoration is NOT listed as a general Go-Live blocker. The current executable still refuses migration until its replacement policy is explicitly qualified; this is a specific guard conflict, not a request to repeat restoration tests.

## Non-destructive ordered execution

Before each batch: confirm actual Production deployment identity and ledger; no unexpected migration, missing relation or baseline drift. Record backup identity/age/expiry and all intended hardening transitions. Existing0020 reduces legacy session expiry and resets last-activity to creation;0021 cancels obsolete/duplicate OPEN document requests under exact existing rules. These are data updates, not a data-purge authorization; their exact semantics require the migration approval. Preserve passwords, business rows, wallets, documents and both historical admins.

After qualified maintenance contains and drains only attributed writers, use the existing one-connection migration engine: BEGIN, bounded lock/statement timeouts, migration advisory lock, ledger read, file digest verification, protected-table locks/snapshots and preflight. Apply pending approved SQL and ledger entries in the same transaction. Compare protected original columns, row counts, financial integrity, expected hardening changes, constraints/FK, RLS, triggers, sequences and the exact target ledger before COMMIT. Any failed condition rolls back the entire batch. Never infer writer drainage from an idle pool.

Idempotence is ledger-based, not blind repetition of raw SQL: every committed filename is skipped; transaction failure records no successful ledger entries. In particular0034/0035 contain CREATE TABLE/trigger/constraint statements that must not be replayed manually. Reuse the qualified local0020–0035 rehearsal rather than rerunning it unchanged. If approved file bytes or execution mechanics change, qualify that delta only.

## Owner account and real MFA — existing mechanisms only

No existing account is reset or suspended. The final permanent account is `admin@essafariavoyages.com`; temporary coexistence with the two historical admins is intentional until recovery is proven.

Preferred path, if the owner has a legitimate historical administrator login: use the existing authorized user-creation workflow under separately approved maintenance to create exactly the owner account, agency=null, role=SUPER_ADMIN, with a unique temporary password entered privately and forced password change. Do not synthesize an authenticated actor, reuse a Preview password, transfer a Preview TOTP secret or print credentials. If no authorized historical login is available, stop only provisioning and prepare a separately reviewed operator-provisioning scope; do not invent a bootstrap endpoint or impersonate an old administrator.

The existing first-MFA issuer is intentionally pinned to the exact0033 ledger and requires a SUPER_ADMIN whose forced password change is complete. Therefore use this order: create/verify the owner and change its temporary password through legitimate flows; complete batchA; while maintenance stays closed, issue the exact-user, expiring, sealed enrollment authorization through `scripts/mfa-authorize-production.ts`; complete owner enrollment before batchB. Do not simply run this issuer after0035 or remove its ledger guard. If this sequencing is operationally unsuitable, an exact0035-compatible issuer change is a separate reviewed delta.

The issuer also requires a valid canonical32-byte Production MFA_ENCRYPTION_KEY and an owner-controlled RSA3072+ delivery recipient, with its fingerprint bound by approval. Do not generate a private delivery key for the owner, reset an existing key, or substitute the age backup recipient for the RSA recipient expected by this issuer. If another verified administrator is already MFA enrolled, use the existing administrator authorization mechanism instead of first-admin issuance. No enrollment code is printed by the issuer; only a hash is stored with a30-minute expiry, and sealed delivery must succeed before commit.

Real ceremony, with Google Authenticator on the owner's phone:

1. Owner logs in with the new own password and reaches the legitimate MFA enrollment flow using the private authorization. Generate/display the QR only in the authenticated owner browser; no screenshot or log capture.
2. Owner scans/adds the factor and submits a current TOTP privately. Confirm factor persistence and an honestly MFA-verified session. A password-only session never satisfies this check.
3. Owner saves recovery codes privately, then signs out and completes a NEW password+TOTP login in a fresh session.
4. In a controlled recovery check, consume one recovery code, verify single-use/replay refusal and intended session revocation, then re-enter through password+TOTP. Preserve remaining recovery material under owner control.
5. Only after these real checks may a distinct exact-account authorization retire the two historical admins and revoke their sessions/tokens. Do not delete, suspend or change their roles as part of the migration or provisioning preparation.

The existing local actual-HTTP ceremony covers these mechanisms synthetically. It is not proof that the phone ceremony or the absent Production owner already works. Existing Preview password-only access stays available under its explicit isolated-Preview pause until real enrollment is validated; Production MFA is not disabled.

## Environments, connections and notifications

Production: correct project/schema, a dedicated Production MFA encryption key, session secret, verified TLS, private database/Storage secrets and no NEXT_PUBLIC secret exposure. Preview: the existing isolated project, its own secrets and schema, protected exact branch context. Do not let the broadly scoped historical DATABASE_URL be inherited by the prepared isolated RC. Current API metadata shows no Production MFA_ENCRYPTION_KEY, only an old branch-specific Preview entry; secret values not returned by the API cannot be certified from variable names. Supersede stale settings only under targeted configuration approval; do not silently delete integration-managed variables.

Remove/retire unused SEED_ADMIN_PASSWORD, SEED_AGENCY_PASSWORD and PREVIEW_ADMIN_BOOTSTRAP under explicit environment-change approval after dependency review. The current retired bootstrap returns404 and production builds never seed/migrate. Explicitly keep ALLOW_DEMO_SEED=false. Exact RC branches forbid automatic migrations/seeds independently of that flag. No application account password changes are implied by retiring unused environment variables.

Runtime Drizzle tables are schema-qualified; runtime pool max is3 per Vercel instance, migration pool max1. A session-pooler limit is not fixed by buying Pro or increasing max connections. Take runtime DATABASE_URL from the project's official Connect panel using transaction mode for serverless, and preserve an explicit direct/session endpoint for the migration operator. Revalidate TLS, prepared-statement compatibility, raw SQL session-state use and the exact target before authorizing any switch; do not blindly rewrite a secret's port. Current secret metadata alone does not establish the effective deployed mode.

The notification scheduler keeps the15-second successful visible cadence, serializes requests, aborts its own browser transport after20 seconds, backs off failures30/60/120 seconds, pauses hidden tabs and stops on401/403. Browser cancellation is not a claim of cancelled server SQL. UI, sounds, links, role/tenant API checks and data remain unchanged. New bounded local regressions cover this delta; no hosted load is permitted.

## CI, single Preview smoke and publication

Workflow `.github/workflows/master-rc-local-verification.yml` is scoped to a push on the exact master RC branch, with optional manual dispatch, exact checked-out SHA, read-only repository permissions, local PostgreSQL and no deployment steps. The initial authorized push starts one run without installing a dispatch-only workflow on main; do not dispatch a duplicate run. Git publication still needs approval. First confirm Vercel's Git integration/deployment policy cannot auto-deploy the push; the tracked config disables the exact RC branch. Do not assume that running a workflow on an older remote SHA verifies the new local candidate.

Prepared RC context now includes only `codex/master-go-live-rc-2026-10-17` in addition to the existing isolated branch, with the same Vercel project, database, schema and TLS gates. It cannot be promoted unchanged using Preview-scoped environment metadata as a Production deployment. Production requires its separately approved release ref and correct Production variables. No prefix wildcard, fabricated metadata or Production MFA exemption is added.

After targeted approval: publish the exact final SHA, run one CI qualification, prepare the existing isolated Preview's required legal migrations/configuration without auto-seeding, and deploy that same CI-passed SHA. A single serial owner-login/protected-health/legal FR/EN/AR/RTL smoke reuses the historical local and bucket proofs. Add only the minimal document-provider check if that hosted provider is actually activated/qualified; do not create test accounts, switch provider or apply0036 merely for a smoke.

## Legal publication and rollback

FR/EN/AR content remains OWNER APPROVED. Match the immutable pack/document hashes and the separate bound owner-approval record; REVIEW on source provenance is not a new content-approval requirement. Existing `publishLegalContents` supports the owner-selected AT_RECORDING policy: one real DB clock instant after locks, immutable versions, author/audit and content hashes, plus idempotent approval binding. Activate through an authenticated legitimate SUPER_ADMIN only; do not seed a fake publication or edit approved clauses.0035 is required for the additional kinds and acceptance receipts. Rendering RTL and acceptance behavior reuse existing local tests until the single actual hosted smoke. Hosted legal publication remains a separate controlled write.

Before commit, migration error means full SQL rollback. After a successful additive migration, roll application traffic back only under maintenance, preserving the newer schema and all evidence; no DROP/down-migration. The old8316 application predates MFA, so it is not an automatically acceptable public fallback once the owner depends on MFA. Keep maintenance closed and prefer a forward fix or an explicitly qualified MFA-compatible build. Managed backup restoration is an emergency full-database operation with separate approval, expected RPO and Storage reconciliation; it is not automatic rollback and is not claimed tested by this preparation.

Open a bounded commercial pilot progressively after explicit Go-Live approval; registered-agency count is not concurrency. Retain the local PASS50/STOP100 and do not claim500 simultaneous users. Watch startup errors, SQL pool waits/timeouts, latency, denied access, login/MFA failures, financial idempotence/reconciliation and document errors. Any security/integrity anomaly stops onboarding immediately; sustained error/latency regression stops expansion. No hosted load test, new subscription, DNS change, merge/main promotion, historical-admin retirement or Production publication is authorized here.
