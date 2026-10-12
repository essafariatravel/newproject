# ESSAFARIA Travel Platform Upgrade

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Native implementation in this chat, followed by independent final review, is already approved.

**Goal:** Modernize the real public, Agency and Staff portal with a coherent ESSAFARIA identity and accessible functional motion; publish GitHub and Vercel Preview only.

**Architecture:** Preserve every route, server query, action, permission and business rule. Layer the approved lab's Navy/White/Gold identity onto shared chrome and controls, then refine entrance and dossier presentation. Small client components own navigation and motion; data stays server-side.

**Tech Stack:** Existing Next.js 16, React 19, Tailwind 4, TypeScript. No new UI framework.

**Spec:** `.agents/skills/essafaria-product-design/SKILL.md` and the user's latest real-portal upgrade request.

## Global Constraints

- Production completely out of scope; no merge to main.
- No RBAC, auth, tenant, wallet, pricing, workflow, migration or database changes.
- Preview builds on `design/essafaria-northstar` must not migrate or seed.
- Public is editorial, Agency mobile-first, Staff dense and queue-first.
- Exactly three application steps; destination, traveller, status, next action remain legible.
- Purposeful motion only, RTL-aware, reduced-motion respected; no bounce, card lift, glass or decorative gradients.
- Existing uploaded branding overrides remain supported.

## Review Focus

- Long Arabic labels at 320px must fit without page overflow or obscured actions.
- Nested application routes must highlight the deepest matching navigation link, not Home.
- Empty real catalogue/dossier data must remain honest; no fabricated programme counts or readiness.
- Mobile bottom navigation must leave logout and less frequent destinations reachable.
- Hosted Preview must use its isolated environment and skip automatic database changes.

## Wireframe / system map

Public: compact brand/navigation → editorial travel entrance + portal access → live destinations → service/process/FAQ. Agency: brand/header + destination/start surface → real action-required dossiers → recent travel records → restrained wallet summary. Mobile: four primary destinations plus the existing menu for secondary routes. Staff: existing sidebar → search/context → compact queue metrics → tables. Dossier: traveller/destination masthead → integrated next action → unchanged document/history tabs. Account, wallet and document screens inherit controlled typography and consistent controls rather than marketing imagery.

### Task 1: Preview safety

**Files:** `scripts/lib/build-policy.ts`, `tests/build-preview-guard.test.ts`.
**Interfaces:** Existing `automaticDatabaseChangesForbidden(branch)` boolean contract unchanged.
- [ ] Add failing assertion that the design branch forbids automatic DB steps.
- [ ] Run that test and observe false vs true.
- [ ] Add branch to existing guard; rerun green. Commit safeguard before publication.

### Task 2: Shared identity, chrome and motion

**Files:** `src/app/globals.css`, `src/components/app-shell.tsx`, `src/components/nav-list.tsx`, new presentation-only navigation helpers/components, `public/fonts`, `public/images`, `.gitignore`, `AGENTS.md`.
**Interfaces:** Keep AppShell/NavList props and server children; use existing permitted nav items.
- [ ] Test exact/longest-prefix active-route selection including wizard, dossier, unrelated routes.
- [ ] Observe missing helper failure; implement helper and four primary Agency links without hiding secondary menu.
- [ ] Introduce self-hosted Barlow / IBM Plex Arabic; white operational surfaces, Navy actions, selective Gold, controlled density.
- [ ] Add route-content continuity and disclosure motion without hiding content or triggering business actions.
- [ ] Verify keyboard, menu dismissal, reduced motion and RTL. Commit when typecheck/test pass.

### Task 3: Travel-led screens

**Files:** public Home/header/login presentation, Agency Home, application-detail presentation, portal application list/profile, staff queue/users presentation, shared CSS.
**Interfaces:** Consume existing queries/actions unchanged; current database values are the sole source of fees, status and totals.
- [ ] Preserve working layouts/actions and render baseline before edits.
- [ ] Refine public and Agency entrances; render real active dossiers as readable mobile travel records.
- [ ] Integrate dossier next action; preserve three-step wizard and operational restraint.
- [ ] Tighten Staff table hierarchy, account layout and shared forms.
- [ ] Run typecheck, lint, build, tests and browser journeys; record any blocked suites by name.

### Task 4: Render, critique, independent review and Preview

**Files:** review evidence under `outputs/travel-platform-upgrade`, screenshot scratch under repo `.screenshots` (not committed), final tracked change report.
- [ ] Render public/Agency/account screens at 390 and 320px, Staff at 1440px, Arabic Agency + dossier/wizard.
- [ ] Critique using Impeccable only after structure is preserved; one restrained correction pass.
- [ ] Independent review of whole change range; fix important regressions with covering tests.
- [ ] Publish commit to GitHub branch; create Vercel Preview for exact SHA, never Production.
- [ ] Verify deployment readiness, isolated schema/health and rendered public routes; distinguish local authenticated evidence from hosted evidence. STOP with files, SHA, URL, screenshots and limitations.
