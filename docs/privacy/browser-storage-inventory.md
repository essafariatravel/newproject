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
