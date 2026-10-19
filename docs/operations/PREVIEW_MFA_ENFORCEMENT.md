# Temporary password-only Preview login

This change requires separate owner approval before live configuration or deployment. It is not an account recovery mechanism. Verify the owner and the selected test accounts through an authorized channel; use their existing passwords, never an assumed identity or a fabricated session.

## Exact activation scope

- Repository: `essafariatravel/newproject`.
- Vercel team: `team_KlSuy7Z6To4vppiHgR0KhrLK`; project: `newproject` / `prj_0WOxlorbYiljjjBvZ1Cm6M9JmPdp`.
- Branch: `codex/preview-mfa-enforcement-2026-10-14` only.
- Vercel environment: Preview only. The runtime must expose the genuine project and Git branch system variables. Missing metadata keeps MFA enforcement enabled.
- Supabase project: `xgetzgixalrsmuvfthpf`, database `postgres`, schema `visa_os_preview`. Check the deployed DB identity and TLS with the authorized private profile before activation. Runtime URI validation is a routing guard, not proof of a live DB connection.
- Set the server-only Config variable `MFA_ENFORCEMENT_ENABLED=false`, targeted only to Preview and this branch. Never create a Production/global/client variable with this value.
- Deploy the separately approved commit to Preview only. Do not merge, promote, replace Production aliases, migrate, seed, bootstrap users or modify account credentials/roles.

The paused flag and protected branch forbid automatic build migrations/seeding. Keep `ALLOW_DEMO_SEED` disabled. Database connection values, encryption keys and deployment protection remain private and unchanged.

## Behavior

All six existing roles use their existing password and authorization. Staff go directly to `/admin`; agencies go to `/portal`. Direct `/mfa` visits redirect to the relevant workspace. Unique account email login is allowed in this Preview mode; existing agency usernames continue working. Ambiguous emails return the same generic invalid-credentials response and require the existing unique username.

Active account/agency status, pending activation, forced password changes, rate limits, session cookies, credential generations, idle/absolute expiry, revocation, RBAC and tenant checks remain enforced. Normal login still writes its session and audit event; completed staff password-only logins are labelled `USER_LOGIN` with `authentication=password` and `mfaEnforcement=preview-paused`.

Existing MFA secrets, recovery hashes, enrollment authorizations and historical audit entries are retained. Session MFA verification markers are never manufactured. Enrollment, confirmation/recovery, authorization issuance and MFA reset actions are unavailable while paused, and their controls are hidden. Other security controls remain available under existing permissions.

## Validation after approved deployment

Check exact deployment SHA, Preview metadata, project/schema and verified TLS first. With independently authorized staff and agency test profiles, use Playwright to submit actual passwords through `/login`, confirm the expected workspace and protected API responses, and confirm direct `/mfa` navigation does not show enrollment/challenge fields. Check a cross-tenant denial and unchanged roles, MFA/recovery/history records. Login-created sessions, login timestamps, rate-limit counters and append-only login audits are expected normal effects.

Do not save passwords, cookies, tokens, traces/HARs or account data in reports. Report role, route, status, safe aggregates and hashes only. Local simulated Preview tests cannot substitute for hosted acceptance.

## Restore enforcement

Change this branch's Preview Config variable to `MFA_ENFORCEMENT_ENABLED=true` and redeploy the same verified commit. Vercel environment updates take effect on a new deployment. Password-only staff sessions again require a real MFA challenge; their verification marker remains empty. Pending sessions older than ten minutes must sign in again under the existing policy. Agency username login remains available; the temporary agency email extension ends with the pause.

This restores the prior policy, including any pre-existing enrollment/key recovery blockers. It does not repair missing MFA keys or enroll an administrator. Preserve all MFA encryption keys and recovery records throughout.

Production ignores a false value because its environment/schema cannot satisfy the Preview guard. The change includes no database migration.
