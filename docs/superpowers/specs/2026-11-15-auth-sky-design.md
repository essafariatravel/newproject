# ESSAFARIA access screens: sky and editorial precision

## Brief and source of truth

Refine the supplied centered sky composition for /login and /agency/register. WebBeds is a reference for task focus and compactness, not a source of branding or decorative waves. Keep the official configured ESSAFARIA logo, the cloud photograph from the owner's Preview and the existing Barlow / IBM Plex Sans Arabic identity. The intended feeling is calm, exact and premium: the photograph carries the travel context; the form carries the task.

Functional baseline: Production source b9e2abce8a83f96aa0b2ccf6c2db968458d66cd8. Visual material only: Preview source 62a511cb3e3ceb57b5bc27ff863cb1354853f7ff, public/images/login-cloud-sky.webp. No form logic is imported from that older Preview.

## Composition

Use one opaque white surface on a static, full-viewport sky. The login card is capped at 432 px and the registration card at 576 px. Both use 32 px desktop padding, 24 px mobile padding, a 16 px radius and one soft shadow. There is no nested translucent frame, ornamental border, glow, cloud animation or entrance choreography.

The logo remains unmodified and uncropped, followed by the product wordmark. All form content aligns to the logical start. The heading uses Barlow SemiBold at 30/36 px, reduced to 28 px on narrow screens; Arabic uses Plex Arabic with a taller line height and no tracking. Body and input text remain 16 px; labels and utility links are 14 px; supporting captions are 13 px. Use only the installed regular and semibold font weights.

Inputs and primary actions have a 52 px minimum height and a 10 px radius. Labels sit 8 px above inputs; login fields have 16 px separation and registration fields 20 px. The recovery link stays close to the password. Home, the alternate access route and the existing language action form the compact footer. The original restricted-access disclosure remains outside the login card.

Registration retains Company, Primary contact and Consent fieldsets. Company name and city share a desktop row. The contact name spans the row; email and phone follow in their existing DOM order. Subgrid aligns adjacent inputs while reserving a separate error row. Below 640 px all fields become one column. Consents and the review note remain complete and verbatim. The submit label is shortened in all three locales; the adjacent explanatory text continues to state that access follows review and approval. Registration may scroll naturally; neither card has a fixed height or an internal scroll area. The brand row wraps when text is enlarged.

## Tokens and accessibility

Reuse the current identity: navy #071a33, gold #c99a32, gold hover #dab66b, muted text #465b6e, field border #8a8f98 and white paper. Gold always carries navy text. The static token pairs calculate to 6.77:1 for the primary button, 7.04:1 for muted text on white and 3.25:1 for field borders on white; rendered verification is still required.

Every interactive element gets an immediate visible focus indicator. Preserve semantic labels, native required and input types, autocomplete, password managers, paste, error associations, pending states and the password visibility toggle. Locale changes use the current server action. Arabic is true RTL; email and telephone remain LTR. At 320 px and at enlarged text sizes the layout must reflow without horizontal overflow. Reduced motion suppresses decorative motion; no animated backdrop is authored.

## Functional boundaries

Keep authentication, MFA, redirects, role routing, current form actions, Turnstile configuration and actions, login lockout and its countdown/identity behavior, validation, registration review semantics, legal publication checks and legal version hidden inputs unchanged. No server action, DB, migration, seed, build policy, pricing, wallet or workflow edit belongs to this task.

The existing public layout remains intact. Contextual CSS hides its marketing header and footer only while one of these two access screens is present, matching the supplied Preview's mechanism. Navigating to another public route restores that route's normal chrome.

Intentionally removed from the login composition: the old Ostuni split-screen photograph, its place caption and accompanying marketing explanation; the requested sky composition replaces them. The old image assets and their source copy remain available elsewhere. No factual or legal form copy is rewritten.

## Review and completion

Review in one batched round: login and registration at desktop 1440×900 and mobile 390×844, including Arabic mobile; inspect English, a 320 px viewport, keyboard focus, password reveal, session-expired/reset-complete messages, registration errors and the legal-unavailable state. Confirm normal public chrome returns after navigation. Apply one grouped correction pass, then at most one confirming round for affected states.

Use real local renders and synthetic local fixtures. Do not submit a genuine hosted login or agency registration for visual verification. Root owns dependency/bootstrap work, typecheck, lint, build, existing tests and the one requested manual design detector pass. Phase 2 owns responsive/render review; Phase 3 independently audits. At initial Phase 1 handoff, rendered acceptance remains pending.
