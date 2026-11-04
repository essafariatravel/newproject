# ESSAFARIA bot protection V2

## Scope and implementation plan

Base approved Production SHA `d5c923661c36204d4e09ffbddafd4c1a5dd1684e`.
Branch `codex/essafaria-bot-protection-v2` in the existing isolated worktree.

1. Inspect the four public authentication server actions, their forms, distributed counters and live Firewall configuration.
2. Add one server guard using the existing PostgreSQL counters. Validate request origin, trusted Vercel client IP, Siteverify success, exact configured hostname, expected action and a challenge age under 300 seconds. Atomically consume a hash of the full token after validation to reject concurrent replays.
3. Add a shared Managed widget with interaction-only appearance, explicit rendering, token expiry/reset handling, localized accessible feedback and retry. Pass only the public widget configuration to client components.
4. Require the guard in login, agency registration, recovery intake and access-token reset. Keep authenticated password changes and owner MFA on their existing authenticated paths. Keep existing per-account limits and add a bounded reset-token limit.
5. Test the verifier, concurrency, expiry, direct server actions, forged metadata, direct API requests, failure handling and form retries on loopback with a simulated verification service. Build, lint and run the related existing authentication tests.
6. Document the observed Firewall configuration, proposed rules and cost implications. Publish no Firewall change. Prepare Preview only after real Preview keys and isolated database settings have been verified.

## Release boundaries

Production and live Firewall changes require the owner's final GO. No hosted load tests. No new paid service. Local tests use disposable PostgreSQL and a simulated Cloudflare endpoint intercepted by the test harness. The application Siteverify URL is fixed. No migration is required because the existing atomic `auth_rate_limits` table supports short-lived replay claims.

Hosted authentication must fail closed when Turnstile configuration is absent or invalid. Test keys are rejected in hosted environments. Optional local disablement is accepted only with an explicitly configured loopback database and no Vercel environment metadata.

## External dependencies

The owner confirmed that no Turnstile widget has been created. Preview requires a dedicated Managed Free widget and its keys entered directly in Vercel Preview. The existing Preview database variables are scoped to another branch, so generic Preview defaults must not be used for this branch. A deployable artifact alone does not establish hosted acceptance.

## Existing protections and actual gaps

| Surface | Already present at the Production base | V2 addition |
| --- | --- | --- |
| Login, Agency and Staff | Shared PostgreSQL limits: 40/IP/15 min, 10/normalized identity/15 min; generic credential errors; audited session creation | Mandatory action-bound Turnstile before account counters or password work; 60/IP/15 min pre-verification ceiling |
| Agency registration | Honeypot, render-time heuristic, strict field allowlist, legal version validation, approval workflow; shared 5/IP/hour and 20/IP/day limits | Mandatory Turnstile; 20/IP/hour verification ceiling; 5/normalized email/hour |
| Recovery request | Shared 20/IP/hour and 3/identity/hour; indistinguishable acknowledgement; no unknown identity persisted | Mandatory Turnstile before recovery intake |
| Access reset and activation | Hashed, expiring, credential-version-bound single-use links; transactional password replacement, link consumption and session revocation | Mandatory Turnstile; 20/IP/15 min verification ceiling and 5/reset-link hash/15 min |
| Sessions and permissions | Opaque hashed sessions, existing cookie settings, owner MFA, tenant-aware authorization | Existing business/auth checks retained; new engineering Preview explicitly enforces MFA |
| Vercel | Automatic network mitigation; one custom Preview host rule | Recommendations below only; no activation |

The old honeypot and timestamp were client-controlled heuristics, not proof of a human. In-memory registration throttling was advisory; the PostgreSQL counters already provided the distributed foundation. No new schema or paid Redis service is needed.

Counters expire by fixed windows. A rejected attempt never suspends an account or agency. Existing shared-IP limits can affect agencies sharing an office connection; do not tighten them without real, privacy-safe operational evidence. Turnstile limits automation but cannot eliminate human challenge farms, compromised browsers or attacks spread across many valid identities.

## Verification contract

- The fixed Siteverify endpoint is called only on the server, with no redirect following, no response cache and a five-second timeout. No configurable verifier URL or hosted test bypass exists.
- Require exactly one string response, 1–2048 characters, an HTTPS same-host Origin on an explicit hostname allowlist, and a platform client IP. Loopback HTTP is accepted only in an explicit local database environment.
- Require `success === true`, the exact expected action and the current request hostname, a parseable timestamp less than 300 seconds old, and at most 30 seconds of positive clock skew.
- Siteverify is the authority for one-use tokens. An additional atomic PostgreSQL claim on the hash of the entire token rejects concurrent application replays. Tokens and keys are never logged or persisted raw.
- Cloudflare rejection, timeout, malformed response or database outage fails closed. A retry gets a fresh widget token; there is no silent fail-open mode. Form values are retained on a same-page error.
- Only `{enabled, siteKey}` crosses the server/client boundary. The secret is never a `NEXT_PUBLIC_` variable. Missing hosted configuration disables submission and is also rejected server-side.
- Widget configuration is Managed plus `appearance: interaction-only`, explicit rendering, automatic expiry refresh, localized feedback and keyboard-accessible retry. No puzzles are introduced. Cloudflare's required widget/branding remains intact when displayed.
- Existing Next.js Origin checks remain enabled. The application additionally checks Origin within the action, including direct calls. No authenticated API, owner MFA endpoint or health endpoint gains a public bypass.

Actions: `agency_login`, `agency_registration`, `account_recovery`, `access_reset`. Staff login uses the existing shared login endpoint and the same `agency_login` action.

## Firewall inspection and recommendations — INACTIVE

Read-only CLI inspection on 2026-11-04, project `prj_0WOxlorbYiljjjBvZ1Cm6M9JmPdp`:

- Firewall enabled; mitigations active; Attack Mode off.
- No IP blocks or system bypass IPs.
- One enabled Deny rule: `ESSAFARIA_Preview_Old_Hosts_Hold` (`rule_essafaria_preview_old_hosts_hold_VY9fO4`). It applies only to Preview and excludes twelve explicitly allowed hosts. This includes the stable `newproject-preview-essafaria-travel-s-projects.vercel.app` alias. Production is outside this rule.
- Bot Protection off, AI Bots allow, OWASP off; CLI reports BotID Basic. That label alone does not establish per-form verification.
- MCP active-config query returned 404; the CLI successfully read the active configuration. No conclusion relies on that failed MCP read.

Do not enable a site-wide challenge, Attack Mode, blanket country/ASN/VPN blocks, global API challenges, or a public bypass based on a client-supplied header. Preserve protected Preview access, owner administration and existing health checks.

Proposed rules for owner review:

| Recommendation | Narrow match | Action and exclusions |
| --- | --- | --- |
| Authentication observation | POST to `/login`, `/agency/register`, `/forgot-password`, `/reset-access/*` on approved Production or Preview hostnames | Begin with logs/observation. Match all POSTs, not only a `Next-Action` header: progressively enhanced multipart requests also invoke actions. GET/HEAD/OPTIONS are excluded. |
| Auth burst control, **cost-gated** | Same POST paths, per platform IP | Candidate 120/5 min, temporary 429 and Retry-After; tune against shared-office usage. No global challenge. **Do not activate under the current zero-extra-cost requirement.** Current Pro WAF rate limiting is metered. Application PostgreSQL counters implement the selected no-new-service layer. |
| Sensitive API observation | Actual `/api/agency/requests`, document upload/download and wallet export paths from the route inventory | Keep existing authentication, RBAC and ownership checks authoritative. Observe method and volume first. No blanket block or guessed rate threshold for export/polling workflows. Exclude `/api/health`, protected internal health checks, platform checks and permitted Preview traffic. |
| Preview host continuity | Existing Preview-only deny rule | Reuse the approved stable alias where possible. If the actual deployment host must be added, present the exact minimal rule diff and obtain owner approval before saving or activating it. Never disable the whole rule. |

The verified team plan was Pro. Vercel documents usage-based rate-limit charges for Pro. Free custom-rule capacity does not make its rate-limit action free. No paid feature, upgrade or rule mutation is authorized by this document.

## Manual Turnstile creation — Preview only

1. Sign in to [Cloudflare](https://dash.cloudflare.com/), open **Turnstile**, select **Add widget**. A Cloudflare account is sufficient; do not add the domain to DNS, transfer nameservers, create Workers or choose a paid plan.
2. Name the widget `ESSAFARIA Visa OS — Preview`. Use **Managed** and the **Free** plan. Leave pre-clearance disabled. `interaction-only` is set in the application, not by choosing Invisible mode.
3. Add only the exact Preview hostname agreed for acceptance, initially the approved stable alias `newproject-preview-essafaria-travel-s-projects.vercel.app`. Do not add `localhost`, Production or a wildcard. Confirm the alias will point to this qualified artifact before using it.
4. Create the widget. Store the secret in a password manager; enter it directly into the Vercel project. Never paste it into chat, a ticket, Git or a command transcript.
5. Vercel → project Settings → Environment Variables: select **Preview only**, branch **`codex/essafaria-bot-protection-v2`**. Configure:

| Variable | Value |
| --- | --- |
| `TURNSTILE_MODE` | `managed` |
| `TURNSTILE_SITE_KEY` | Public site key from this Preview widget |
| `TURNSTILE_SECRET` | Secret key from this Preview widget, Sensitive |
| `TURNSTILE_HOSTNAMES` | Exact agreed Preview hostname, comma-separated only if additional individually approved hosts are necessary |

The site key is public by design. The variable still does not need a `NEXT_PUBLIC_` prefix: the server sends only this key to the form. Never enter the secret into a public variable.

6. Report only “Preview variables configured” and the chosen hostname. No key value is needed in chat. Do not configure Production yet. A separate Production widget and owner GO will be required for release.

## Preview dependency and release gates

Status: **NOT DEPLOYED / external dependencies pending**.

- Real Preview widget and its branch-scoped values are required. Missing values fail closed.
- Existing isolated Preview database variables currently cover a different branch. Configure this branch to the existing isolated Supabase project `nqudhszgodmzckautrby`, schema `visa_os_preview`, using the existing verified-TLS URI and existing MFA encryption key. Do not copy generic Production defaults, create a new owner/MFA factor, run migrations or seed hosted data.
- The branch is pinned to that isolated Preview context and always enforces MFA, including if an older environment flag says false. Automatic migrations, bootstrap checks, seeds and automatic Git deployments are disabled for this branch.
- Verify `STORAGE_PROVIDER=db` for build and runtime; preserve existing branding/auth settings and owner enrollment.
- Check the active Preview Firewall rule against the final hostname before publishing a Preview. Any rule diff still needs separate explicit approval.
- Deploy the exact locally qualified SHA as Preview only once dependencies are verified; preserve Vercel deployment protection. Reuse the stable acceptance alias and existing synthetic acceptance users.
- Run only small functional acceptance flows on hosted Preview: correct login, invalid token, retry, registration, recovery and reset; inspect action/hostname results without tokens or secrets. No load tests.
- Production publication, Production keys and every Firewall activation remain blocked until the owner's final GO. A local green build is not hosted acceptance.

## Cloudflare agent setup

Executed the official [Cloudflare agent setup instructions](https://developers.cloudflare.com/agent-setup/prompt.md) for Codex: installed the 19 Cloudflare skills with Codex agent scope, registered the `cloudflare` MCP server at `https://mcp.cloudflare.com/mcp`, and completed OAuth. `codex mcp list --json` reported enabled plus `o_auth`. Restart Codex to load the newly registered MCP tools. No Turnstile widget, DNS record, Worker, paid service or Firewall rule was created by that setup.

The owner chose to keep skills plus MCP; the optional beta `cf` CLI was not installed. Skills reside in `C:/Users/Azur Computer/.agents/skills/` and the Codex MCP entry resides in `C:/Users/Azur Computer/.codex/config.toml`. OAuth status was verified again from the normal user profile after installation; sandboxed CLI reads cannot reliably inspect that credential store.

## Local verification evidence — 2026-11-04

- Build, TypeScript and ESLint passed with the locked dependency set. No new runtime package was installed. The generated public chunks contain no `TURNSTILE_SECRET` reference or synthetic secret value.
- **217 tests passed across 13 targeted files**, including the new verifier/action tests, existing login, recovery, registration/legal validation, shared rate limiter, MFA, build safety and Preview isolation tests.
- Coverage includes missing/duplicate/file/oversized responses, mismatched action/hostname, cross-host token use, old/future/invalid timestamps, Cloudflare rejection, HTTP/JSON/timeouts, database failure, concurrent replay, account/IP counters and expiration, direct action calls and legitimate login. The local URI routing-override bypass found by review has a regression test and is closed.
- The initial full suite ran **2,142 tests: 2,118 passed, 15 failed, 9 skipped; 226 files passed, 4 failed, 1 skipped**. Fourteen failures were fixtures/static expectations predating the new gate (13 MFA-login cases and one registration button assertion); all were corrected and passed in the final targeted run. The remaining unrelated files `external-storage-recovery.test.ts` and `managed-external-policy.test.ts` need the absent local `age`/`age-keygen` tools (`SYNTHETIC_AGE_FIXTURE_REQUIRED` / `SYNTHETIC_AGE_REQUIRED`). The complete suite was not rerun after the targeted corrections; a fully green global suite is **not** claimed.
- **Browser acceptance passed on the final local build** with a disposable PostgreSQL cluster, synthetic accounts and an intercepted Siteverify endpoint. The fixed production verifier URL was retained; the simulation exists only in a test process preload.
- Browser flows exercised: script-load failure and retry; invalid credentials with field retention and fresh token; action network failure and fresh token; expired challenge disabling submission; valid agency login; complete registration; recovery intake; reset link consumption and redirect. Public authenticated API calls remain rejected without a session; a nonexistent public `/api/login` returns 404; `/api/health` remains accessible.
- Real HTTP Server Action POST with valid credential fields but no Turnstile token was rejected and set no session cookie. The harness uses the encoding of the installed Next.js release rather than assuming older multipart field prefixes.
- Rendered captures cover FR desktop login/reset, EN tablet login, AR RTL mobile login, and FR mobile registration/recovery. No layout overflow or browser page errors were observed in those specific views. The simulation does not establish real Cloudflare challenge appearance or compatibility; hosted Preview acceptance is still required.
- Independent code review found one important local-bypass configuration issue and a missing pair of identity-counter tests; both were addressed and verified. No unresolved critical/important review finding remains in the reviewed scope.
- Read-only final Firewall inspection still reports one active rule, no inactive rules, no IP blocks/bypasses and Attack Mode off. No Firewall writes or Production deployments were performed.

Reproduce focused tests with `npm test -- tests/bot-protection.test.ts tests/mfa-preview-policy.test.ts tests/isolated-preview-boundary.test.ts tests/build-preview-guard.test.ts tests/phase2_2-nav-ui.test.ts tests/login-release-integrity.test.ts tests/recovery-feedback.test.ts tests/agency-registration.test.ts tests/registration-hardening-unit.test.ts tests/legal-registration-integration.test.ts tests/auth-rate-limit-resource.test.ts tests/security-closure.test.ts tests/zz-teardown.test.ts`.

For browser acceptance, build first with `STORAGE_PROVIDER=db` and `ESSAFARIA_READONLY_BUILD=true`. Run `node --import tsx tests/browser/bot-protection.cjs` with `PLAYWRIGHT_MODULE` pointing at an existing local Playwright package and, if necessary, `PLAYWRIGHT_CHROMIUM_EXECUTABLE` pointing at installed Chrome. The harness starts only `127.0.0.1:3197` and a disposable database on `127.0.0.1:54439`, blocks remote browser traffic, intercepts Cloudflare and stops its child processes. It never uses the project’s hosted environment variables.

## Sources

- [Cloudflare server verification, expiry and single use](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
- [Widget appearance and lifecycle](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/)
- [Manual widget creation](https://developers.cloudflare.com/turnstile/get-started/widget-management/dashboard/)
- [Free Turnstile limits](https://developers.cloudflare.com/turnstile/plans/)
- [Official testing guidance](https://developers.cloudflare.com/turnstile/troubleshooting/testing/)
- [Vercel request IP headers](https://vercel.com/docs/headers/request-headers)
- [Vercel WAF usage and pricing](https://vercel.com/docs/vercel-firewall/vercel-waf/usage-and-pricing)
