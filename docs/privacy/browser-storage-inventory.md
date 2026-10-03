# ESSAFARIA VISA OS — Browser Storage & Tracking Inventory

Status: technical source-code inventory for the Legal / Privacy Gate.
This file is descriptive, not a legal conclusion. Consent/notice requirements remain subject to approved legal review.

## Explicit first-party cookies

| Name | Source | Purpose | First/third party | Technical duration | Security flags | Optional? |
| --- | --- | --- | --- | --- | --- | --- |
| `evos_session` | `src/lib/auth.ts` | Authenticated session | First party | Session expiry is currently `SESSION_TTL_DAYS = 7` days | HttpOnly; SameSite=Lax; Secure in production; Path=/ | No — required for authenticated portal use |
| `evos_ui_locale` | `src/app/actions/ui-locale.ts` | Remember EN/FR/AR interface preference | First party | 365 days | SameSite=Lax; Path=/; intentionally readable by client | User preference |

The session token stored in the browser is opaque. The database stores the token hash rather than the plaintext token.

## Session metadata

When a session is created, the current implementation may persist:
- source IP address from the forwarded request headers;
- user-agent string, capped at 300 characters;
- expiry timestamp.

Purpose in the existing architecture: authentication/security/session evidence.

Retention duration and legal wording are **not defined by this file** and require the approved retention/legal process.

## Public agency request anti-abuse metadata

The public registration flow may persist the request source IP for:
- in-memory and database-backed rate limiting;
- spam/security audit evidence.

The privacy request/retention process must therefore include `agency_registrations.ip_address` and relevant audit records when policy is approved.

## localStorage / sessionStorage

Current source-code inventory:

| Key | Technology | Purpose | Personal identifier? | Duration |
| --- | --- | --- | --- | --- |
| `essafaria.notification-sound` | first-party `localStorage` | Remember whether the authenticated user enabled notification sound | No; value is only `on` / `off` | Until changed or browser storage is cleared |

No `sessionStorage` use is currently inventoried.

The Legal / Privacy branch contains a regression test that scans `src/` and permits only the exact `essafaria.notification-sound` key above. The test fails if another localStorage key or any sessionStorage use is introduced without updating the inventory/review.

No applicant, agency, document, authentication token or financial value is intentionally stored in localStorage/sessionStorage.

## Analytics / advertising

The Legal / Privacy branch contains a dependency regression guard for common analytics/advertising SDKs.

Current intended launch state:
- no analytics SDK introduced by this gate;
- no advertising/remarketing pixel introduced by this gate;
- no cookie banner added merely for appearance.

This source-code result is not a substitute for final browser/runtime inspection of a deployed Preview.

## UTM parameters

UTM parameters may be used for ordinary campaign attribution only if an approved implementation exists.

Never place in UTM values:
- applicant name;
- passport information;
- application/dossier private identifiers;
- agency account identifiers;
- email or phone;
- financial references;
- private status information.

## Third-party embeds

No third-party embed is approved by this document. Any later chat widget, analytics script, marketing pixel, embedded video/map or equivalent must be added to the vendor + browser-storage inventory before Production enablement.

## Final verification still required

Before the gate can be marked PASS, inspect the deployed Preview browser to confirm:
1. exact cookies actually emitted;
2. domains, paths and expiry;
3. no unexpected third-party requests;
4. no runtime SDK added outside package dependencies;
5. no sensitive values in browser storage;
6. no non-essential script running contrary to the approved consent decision.

Production must remain untouched during that verification.
