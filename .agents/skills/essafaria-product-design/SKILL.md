---
name: essafaria-product-design
description: Use when designing, redesigning, implementing, or visually reviewing ESSAFARIA VISA OS interfaces across the Agency Portal, Staff Portal, or public website, including UX, frontend craft, responsive behavior, motion, accessibility, and Arabic RTL.
---

# ESSAFARIA Product Design

## Product character

ESSAFARIA is a B2B visa-operations platform for travel agencies. Every interface must feel travel-native rather than like generic SaaS.

- **Agency Portal:** consumer-grade simplicity with B2B power.
- **Staff Portal:** dense operational cockpit.
- **Public Website:** editorial travel brand.

Organize the experience around this grammar:

> Destination → Traveller → Status → Next Action

At every important screen, make those four concepts obvious or deliberately reveal them through progressive disclosure.

## Visual direction

Use:

- white-first operational surfaces;
- Deep Navy for structure;
- Warm Ivory only as restrained editorial warmth;
- slate neutrals;
- Muted Gold sparingly for orientation or accent, never decoration.

Do not use:

- glassmorphism;
- generic SaaS card grids;
- excessive pills;
- huge radii everywhere;
- decorative gradients;
- fake analytics;
- AI-looking empty-state components.

Prefer hierarchy, typography, spacing, dividers, tables, lists, and meaningful travel or dossier cues over decorative containers.

## Agency Portal

Design mobile-first. Deliver consumer-grade travel usability without weakening operational capability.

- Use progressive disclosure and search-first navigation.
- Keep advanced filters hidden until needed.
- Provide immediate access to dossiers.
- Make navigation app-like, not a compressed desktop SaaS sidebar. Evaluate bottom navigation when it improves the primary mobile journeys.
- Make dossiers feel like travel records.
- Make documents feel like operational checklists.
- Make notifications a chronological feed, not a wall of cards.
- Keep the dossier wizard at exactly **three conceptual steps**. Visual subdivisions must not introduce a fourth conceptual step.

## Staff Portal

Design for operational speed and information density.

- Queue-first and search-first.
- Minimal decoration.
- Strong table and list design.
- Optimize for fast scanning, comparison, prioritization, and action.
- Do not use consumer-style oversized spacing.

## Public website

Treat the public website as an editorial travel brand: confident, destination-aware, credible, and clear. Preserve travel context and narrative without importing the density of the Staff Portal or the generic conversion patterns of a SaaS landing page.

## Benchmarks

Use Booking, Expedia, and RateHawk only as benchmarks for:

- clarity;
- circulation;
- search and filter ergonomics;
- hierarchy;
- progressive disclosure;
- travel-product maturity.

Do not copy their branding, layouts, visual identity, or proprietary patterns.

## Human-design test

Apply this test during every critique:

> If removing the words “visa” and “travel” makes the screen look like a CRM, HR SaaS, invoicing app, or generic admin panel, the design is not finished.

When the test fails, restore product specificity through destination context, traveller identity, dossier status, document readiness, chronological history, operational next actions, and travel-native information hierarchy—not through decorative travel imagery alone.

## Motion

Use motion only to explain causality, continuity, state change, or spatial relationships.

- No bounce.
- No spring-heavy motion.
- No card lift.
- No decorative animation.
- Respect `prefers-reduced-motion`.
- Make directional motion RTL-aware.

## Arabic and RTL

Arabic is true RTL, not translated text inside an LTR layout.

- Use logical CSS spacing and positioning properties.
- Reverse directional controls, transitions, navigation cues, and spatial relationships correctly.
- Preserve sensible treatment of inherently LTR content such as codes, document identifiers, and numbers.
- Visually verify Arabic on mobile; code inspection alone is insufficient.

## Accessibility

Require:

- semantic links and controls;
- visible focus states;
- complete keyboard navigation;
- sufficient contrast;
- screen-reader labels for icon-only or ambiguous controls;
- state communication that does not rely on color alone.

## Required workflow

For design tasks, use this sequence:

1. **AUDIT** — inspect the current product, routes, content, constraints, responsive states, RTL behavior, and reusable components. Identify structural UX problems before styling.
2. **WIREFRAME** — resolve information architecture, navigation, hierarchy, task flow, and density.
3. **DESIGN SYSTEM MAP** — map existing and proposed tokens, type, spacing, color roles, components, and portal-specific patterns. Reuse before inventing.
4. **PROTOTYPE** — implement or model the smallest coherent experience that proves the structure.
5. **RENDER** — produce real rendered views at the relevant mobile, tablet, and desktop sizes and in required locales.
6. **CRITIQUE** — evaluate the renders against the product grammar, portal character, human-design test, accessibility, RTL, and generic-SaaS prohibitions.
7. **POLISH** — refine craft only after the structure works.
8. **DISTILL** — remove redundant containers, decoration, copy, interactions, and visual noise.
9. **VERIFY** — verify the actual rendered experience, interactions, responsive behavior, Arabic RTL, and preserved business behavior.
10. **STOP** — report evidence and remaining limitations; do not expand scope or continue polishing without a product reason.

Use `impeccable:impeccable` only after structural UX is sound. Never use polish to compensate for weak information architecture.

## Production safety

Design authorization does not authorize production or business-logic changes. Never modify any of the following unless the user explicitly authorizes it in a separate release task:

- Production database or production data;
- RBAC, authentication, authorization, or tenant isolation;
- wallet or accounting behavior;
- pricing;
- workflow semantics;
- migrations;
- Production deployment or Production environment configuration.

Preserve existing business behavior while changing presentation. If a requested design appears to require a protected change, stop and identify the dependency instead of implementing it.

## Completion contract

Every completed design task must report:

| Required evidence | What to provide |
|---|---|
| Rationale | The structural and visual decisions and why they suit the relevant portal. |
| Before/after | A concrete comparison of the experience, not only a list of edited files. |
| Screenshots/renders | Rendered evidence of the states actually inspected. |
| Mobile result | The mobile outcome and navigation behavior. |
| RTL result | The Arabic RTL outcome, including mobile verification. |
| Remaining generic elements | Anything still resembling generic SaaS or requiring further work. |
| Intentionally removed | Containers, decoration, controls, copy, or motion removed to improve clarity. |
| ESSAFARIA specificity | What now makes the result recognizably visa-operations and travel-native. |

Do not claim coverage for screen sizes, locales, routes, states, interactions, or portals that were not rendered and inspected.

## Common failure modes

| Failure | Correction |
|---|---|
| Styling before fixing navigation or hierarchy | Return to AUDIT and WIREFRAME. |
| A generic dashboard with travel labels | Rebuild around Destination → Traveller → Status → Next Action. |
| Mobile as a squeezed desktop | Redesign primary navigation and disclosure for one-handed, app-like use. |
| Staff screens with large decorative cards | Restore dense queues, tables, lists, and scan-friendly actions. |
| Gold used as ornament | Restrict it to meaningful orientation and accent roles. |
| RTL inferred from code | Render and inspect Arabic mobile and directional behavior. |
| Polish presented as proof | Provide rendered before/after evidence and state what remains unresolved. |
