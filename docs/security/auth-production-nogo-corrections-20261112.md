# Authentication NO-GO corrections — 12 November 2026

Scope: local candidate `release/essafaria-auth-security-20261112`, starting from
`64715b43acc9c8dc23236fe3474f1bd0def3be4d`. No hosted writes, deployment, migration,
customer credentials, DNS change or paid service is involved.

## Public identity privacy

A countdown is returned only after a correct agency password, followed by the
existing transactional recheck of active user/agency and credential version.
An unknown, unusable, pending, suspended, Staff or locked-agency wrong-password
probe receives the same invalid-credentials response, without countdown or cookie.

Every well-sized credential rejection performs a real scrypt derivation, the same
joined identity lookup, and a serialized failure transaction. Unusable hashes use
a syntactically valid dummy hash; the accepted format exactly matches the crypto
verifier, including its case-sensitive `scrypt` prefix. Neutral shadow buckets for
unknown/Staff/unusable identities have the same SQL shape but never lock accounts.
The public email-based countdown lookup was removed.

The single failure CTE and advisory transaction lock preserve the latest two
failures in a sliding ten-minute window. The third failure sets the ten-minute
lock start. Subsequent attempts do not extend it. A correct password during the
lock cannot create a session. Only successful agency session/audit completion
clears its enforced counter. SQL, crypto or Turnstile technical failures do not
become enforced wrong-password events.

## Separate abuse and MFA controls

The original Production budgets are restored: 40 requests/IP/15 minutes and
10 requests/identity/15 minutes. Both apply uniformly to known and unknown
identities, after Turnstile, using the existing distributed atomic SQL limiter.
These request budgets are distinct from the agency three-password lock; they
also count valid requests and can independently cause a neutral throttle response.
In particular, Staff never acquires an agency ten-minute password lock, including
when old counters exist. Staff still needs MFA before privileged access. Agency
sessions do not acquire a new MFA requirement. Existing MFA verification limits,
session cookies, permissions and business logic are retained.

## Individual disposition of the original 14 failures

All original scenarios remain; no security test is deleted and no production
guard is disabled. The thirteen Preview fixtures now simulate only the remote
Siteverify response with a fresh token for each request. The hosted guard, origin,
hostname/action/freshness checks and real local SQL nonce claim remain active.
Historical hosted metadata in those tests is inert policy input; their database
pool remains the disposable loopback fixture.

| # | Original failing scenario | Classification and correction |
|---|---|---|
| 1 | release login integrity: compatibility-equivalent invalid identifiers | Obsolete enforced-counter expectation. Assert a shared neutral rejection bucket, absent enforced agency bucket and no cookie. Normalization remains tested. |
| 2 | authorized Preview login: SUPER_ADMIN | Invalid Turnstile fixture, not proven MFA regression. Add valid simulated challenge; retain identity, role, no MFA verification and access assertions. |
| 3 | authorized Preview login: ADMIN | Same fixture correction; retain all original assertions. |
| 4 | authorized Preview login: VISA_AGENT | Same fixture correction; retain all original assertions. |
| 5 | authorized Preview login: ACCOUNTING | Same fixture correction; retain all original assertions. |
| 6 | authorized Preview login: AGENCY_ADMIN | Same fixture correction; retain tenant and Staff-denial assertions. |
| 7 | authorized Preview login: AGENCY_USER | Same fixture correction; retain tenant and Staff-denial assertions. |
| 8 | account login rate limit while Preview MFA is paused | Production request-quota regression plus invalid fixture. Restore 10/identity/15min; use a fresh valid nonce each time so the assertion tests the quota, not replay rejection. |
| 9 | clean Preview preserves SUPER_ADMIN identity/permissions/honest MFA state | Invalid Turnstile fixture. Simulate valid external response; retain honest MFA state and original authorization assertions. |
| 10 | clean Preview preserves ADMIN identity/permissions/honest MFA state | Same fixture correction; retain all original assertions. |
| 11 | clean Preview preserves VISA_AGENT identity/permissions/honest MFA state | Same fixture correction; retain all original assertions. |
| 12 | clean Preview preserves ACCOUNTING identity/permissions/honest MFA state | Same fixture correction; retain all original assertions. |
| 13 | clean Preview preserves AGENCY_ADMIN identity/permissions/honest MFA state | Same fixture correction; retain tenant isolation. |
| 14 | clean Preview preserves AGENCY_USER identity/permissions/honest MFA state | Same fixture correction; retain tenant isolation. |

Additional old countdown assertions now require correct-password proof; the
three-error counter, correct-password rejection, expiry, sliding window,
non-extension and concurrency assertions remain. New regressions cover neutral
responses, equal derivation/query work, bounded local latency comparison,
malformed/pending hashes, original IP and Staff quotas, and FR/EN/AR behavior.
The browser fixture additionally checks the proof-only countdown in all three
languages and switching to a Staff identity while an agency countdown is shown.
Twelve direct HTTP calls to the built Next Server Action, each with a fresh valid
simulated challenge, assert identical RSC bodies, HTTP status, content type and
cache-control for wrong-password agency/Staff/unknown identities, including after
the agency lock commits. No response sets a cookie or contains a countdown.

The complete run also reproduced a pre-existing cross-file test double leak:
`notifications-localization-render` globally replaced the query/locale modules
and the subsequent real-database notification test rendered the wrong fixture.
Scoped spies with `afterEach` restoration fix the fixture leak. All notification
rendering, translation, tenant and original-message assertions remain intact;
neither the notification component nor its application queries were changed.

## Independent code review

### Standards

No actionable documented-standard violation or Fowler smell remained in the
inspected authentication correction. The reviewer checked SQL serialization,
the frozen lock start, proof-gated countdown and retained server guards.

### Spec

The reviewer identified the malformed uppercase `SCRYPT` prefix fast path.
A failing regression reproduced it before the format check was corrected.
The subsequent static review confirmed closure and found no additional issue.
These reviews are static; executable qualification remains separately required.

## External qualification and rollback

Final local qualification: **2,193 passed, 0 failed, 2 skipped**, across 239 files.
The two pre-existing skips concern an explicitly opted-in DR export fixture and
shell syntax validation without Bash on Windows; no authentication test is
skipped. All fourteen original failures pass individually. The separate focused
regression run passed 95/95. Browser qualification passed fourteen scenarios,
including twelve direct HTTP probes and twelve FR/EN/AR public-form views.
TypeScript, lint and the complete Next.js Webpack build passed.

The final local timing probe observed medians of 57.5 ms for a locked agency,
59.0 ms for an unknown identity and 57.8 ms for Staff (six samples each), alongside
the stronger structural crypto/query-work and exact HTTP-response assertions.
This is bounded loopback evidence, not a hosted load test or a network timing
guarantee. The application-level notification hotfix, MFA, RBAC, Wallet,
PostgreSQL driver, migration files and deployment configuration remain unchanged.

Cloudflare/Vercel metadata was checked read-only: the existing Managed Production
widget has only the Production domain, no pre-clearance, and a distinct Preview
widget. The two Production Turnstile keys and the Production counter secret are
sensitive variables targeted exclusively to Production. Values were not read.

Verdict: **GO for separately authorized hosted qualification; NO-GO for immediate
Production publication** until the exact hosted build and real Production-widget
Siteverify flow are qualified and the owner gives the final publication GO.

Local Siteverify/widget results are simulations, not a real Production token
qualification. The owner-configured Production widget/secret pairing must still
be exercised on the exact authorized hosted artifact. No secret is read or put
in this repository. Preview keys and counter secrets must never be reused in
Production. Scope/type metadata can be verified without decrypting values.

Shared B2B NAT addresses remain subject to the restored 40/IP/15min budget. The
independent request quota may remain active after the agency password lock
expires; it is not an extension of the agency lock. Tuning requires an explicit
policy decision, not a test-only exemption. Local timing evidence removes the
deterministic fast path; it cannot prove identical Internet/network scheduling.

No database migration is required. Before any future deployment, recheck the
current Production alias and target SHA. If a separately authorized release
fails, roll back to the existing last-known-good Production artifact without
rebuilding. At this review the artifact is `dpl_3dk5yD3EuYWmdTNTEDwtgx8bSMii`,
SHA `512dda1a7ef6c5b2d018cc36be1aa028b79a269d`. Do not restore/erase customer
data, Wallet history, MFA factors or sessions and do not purge security counters.
No rollback command is executed as part of this local correction.
