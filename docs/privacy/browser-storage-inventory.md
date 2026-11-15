# ESSAFARIA VISA OS — Browser Storage, Cookies & Tracking Inventory

Status: source-code inventory for the Legal / Privacy gate.
Date reviewed: 2026-10-03.

This is a technical inventory, not a legal conclusion about consent requirements.

## First-party cookie/storage inventory

| Name / key | Mechanism | Party / provider | Technical purpose | Value / identifiers | Lifetime | Attributes / scope | Technical essentiality candidate | Legal-review status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `evos_session` | Cookie | First-party, ESSAFARIA application | Authenticate an active Staff/Agency session | Opaque cryptographically generated session token; only its hash is stored server-side | Staff: max 12 h absolute / 30 min idle. Agency: max 24 h absolute / 2 h idle. Cookie expiry matches the absolute server expiry | `HttpOnly`; `SameSite=Lax`; `Path=/`; `Secure` in production | Technically necessary for authenticated portal operation | Technical classification complete; jurisdiction-specific notice/consent conclusion remains Legal Review Required |
| `evos_ui_locale` | Cookie | First-party, ESSAFARIA application | Remember EN / FR / AR UI preference | One locale code: `en`, `fr`, or `ar` | 365 days | `HttpOnly=false`; `SameSite=Lax`; `Path=/`; `Secure` in production | Functional preference, not required for authentication | Technical classification complete; consent/notice treatment remains Legal Review Required if applicable |
| `essafaria.notification-sound` | localStorage | First-party, ESSAFARIA application | Remember notification-sound preference | `on` / `off` only; no user/dossier identifier | Until changed or browser storage is cleared | Origin-scoped localStorage; no explicit server expiry | Functional preference | Technical classification complete; consent/notice treatment remains Legal Review Required if applicable |

No third-party cookie/storage key is intentionally created by application source reviewed in this gate.

No applicant, agency dossier, document, wallet value, authentication secret, or private case content is intentionally stored in localStorage/sessionStorage.

No sessionStorage use is currently inventoried.

## Session-side security metadata

Session creation may persist:
- source IP address;
- user-agent string capped at 300 characters;
- expiry and last-activity timestamps;
- credential version.

This is security/authentication metadata in the current architecture. Its approved retention duration remains a policy decision.

## Public registration anti-abuse metadata

The agency request-access path may record source IP for anti-abuse/rate-limit/audit purposes. Privacy lifecycle procedures must therefore include the registration IP field and relevant audit evidence.

## Analytics / advertising

No analytics or advertising dependency is present in the current package dependency set reviewed for this gate.

This branch adds a regression test to prevent silent introduction of common analytics/advertising SDKs without updating this review.

No cookie banner is added merely for appearance. If a non-essential technology is introduced later, inventory and legal/consent review must occur before Production enablement.

## UTM / campaign attribution

UTM parameters may be used for ordinary campaign attribution only.

Never encode in a campaign URL:
- applicant name;
- passport data;
- dossier/application private identifiers;
- email or phone;
- agency account identifier;
- financial/payment reference;
- private application status.

## Third-party embeds

No third-party embed is approved by this document. A future chat widget, marketing pixel, analytics script, embedded map/video or similar integration must enter the vendor + browser-storage inventory before release.

## Runtime verification evidence

Hosted Preview QA completed during this gate verified:
- `evos_session` is actually emitted with `HttpOnly`, `Secure`, `SameSite=Lax` and `Path=/`;
- public HTML contained no common analytics/advertising marker;
- anonymous health output is redacted rather than exposing database/schema internals.

The locale-cookie implementation is source/test guarded to require `SameSite=Lax`, `Path=/`, a 365-day max age and `Secure` in production. Recheck the deployed cookie after the next eligible Preview deployment containing that exact change.

A future release that adds browser storage, third-party scripts or analytics must update this inventory before Production enablement.


## GA4 integration candidate — 2026-11-15 (not yet active in Production)

The candidate branch adds Google Analytics 4 for anonymous public-marketing page visits **only after explicit opt-in**. Verified non-secret Measurement ID: `G-GZXQJW9ZHE`. Production hostname gate: `visa.essafariavoyages.com`; no analytics requests in Preview.

| Key / mechanism | Purpose | Scope and lifetime | Release requirement |
| --- | --- | --- | --- |
| `essafaria.analytics-consent.v1` (first-party localStorage) | Remember accepted/rejected analytics choice | Origin-scoped; until changed or local browser data is cleared | Consent notice in EN/FR/AR, equally accessible decline and persistent preference control |
| `_ga`, `_ga_*` (Google Analytics cookies, only after accept) | GA4 visitation metrics and pseudonymous analytics identifiers | Browser-managed; actual expiry must be verified in DevTools and documented against approved retention | Google/ESSAFARIA controller-processor and transfer review; cookie policy and privacy notice approval |

Analytics tag loads only when opt-in is persisted and the visitor is on public marketing routes. The explicit event sends a static title and an allowlisted pathname, with no query string, form fields, applicant/agency identity, password, dossier ID, registration reference or wallet data. No Staff or Agency workspace tracking is permitted. The tag executes exclusively inside a separate, inert `/analytics-bridge.html` iframe after consent; Next.js navigation to private URLs does not change that iframe's history and cannot become a GA4 history-based pageview. The iframe validates exact Production origin and a tightly allowlisted pathname in every message. The parent sends only the sanitized pathname. Verify the Google measurement settings and Tag Assistant after activation; `send_page_view: false` suppresses the initial automatic pageview.

**Release gate:** Update and approve published EN/FR/AR cookie/privacy notices (the application keeps immutable legal versions), verify Google's vendor terms and any international-transfer basis, verify cookie retention and withdrawal, and check browser network requests before and after consent. Do not enable this candidate in Production on the basis of this engineering inventory alone.
