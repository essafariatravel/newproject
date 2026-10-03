# ESSAFARIA VISA OS — Browser Storage, Cookies & Tracking Inventory

Status: source-code inventory for the Legal / Privacy gate.
Date reviewed: 2026-10-03.

This is a technical inventory, not a legal conclusion about consent requirements.

## First-party cookie/storage inventory

| Name / key | Mechanism | Technical purpose | Data | Technical lifetime |
| --- | --- | --- | --- | --- |
| `evos_session` | Cookie | Authenticated session | Opaque random session token; DB stores its hash | Absolute expiry follows the server session policy; cookie expires with that session |
| `evos_ui_locale` | Cookie | Remember EN / FR / AR UI choice | Locale code only | 365 days |
| `essafaria.notification-sound` | localStorage | Remember notification sound preference | `on` / `off` only | Until changed or browser storage is cleared |

`evos_session` is HttpOnly, SameSite=Lax, Path=/ and Secure in production.

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

## Final runtime verification required

Source review cannot prove what a deployed browser actually receives. Final Preview QA must inspect:
- cookies and storage keys;
- expiry/domain/path/SameSite/Secure attributes;
- third-party network requests;
- runtime-injected scripts;
- sensitive values in request URLs, browser storage or console output.

Production is not required for this verification.
