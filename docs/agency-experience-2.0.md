# ESSAFARIA Agency Experience 2.0
Baseline f737f97. Preview only. Portal routes only.
| Page | Critique | Three alternatives | Decision |
|---|---|---|---|
| Shell | small labels | Sidebar / Dock / Toolbar | Dock + toolbar |
| Dashboard | heavy header | KPI / operations / search | Operations + search |
| Applications | filters conceal queues | Kanban / grid / queues | Grid + queues |
| New request | dense text | one form / wizard / chat | Wizard; fee and step clarity |
| Dossier | next action weak | pass / timeline / workspace | Workspace + existing timeline |
| Wallet | funding buried | wallet / ledger / hub | Ledger + hub |
| Documents | wide table | gallery / file list / checklist | List + checklist links |
| Applicants | wide table | cards / directory / CRM | Directory |
| Notifications | dense feed | feed / inbox / center | Feed + center |
| Communications | dense metadata | chat / inbox / case | Inbox + case; existing action |
| Profile | small text, heavy header | settings / card / team | Settings + team |
Self-review: no decorative glass in content, no invented data or upload progress, preserve existing routes and all financial actions; scoped CSS; responsive directories, readable labels and keyboard focus, logical RTL and reduced motion. Authenticated visual and functional QA still required. Do not perform writes to a live backend from Preview.

Second code-review pass: remove redundant dashboard and wallet CTAs; prioritize actual attention queue before search; use localized landmark label; correct tablet bottom padding; expose real required-document selection progress, not network transfer progress; add file-picker keyboard focus. First Preview build READY before this correction. Authenticated visual review remains pending.

## Benchmark critique — 2026-11-24
Airbnb hosting: task-specific reservation details and contextual messaging; Expedia TAAP: agent booking manager, itemized costs and reports; Booking.com for Business: dashboard, managed bookings and spending. The first preview is still a cosmetic iteration, not benchmark parity. Confirmed source findings: incorrect refund sign on dashboard, submit function did not explicitly gate step three, generic submitting label despite staged requests, no explicit submitted receipt from the redirect, effective price separated from billing. This commit corrects those in agency UI. No backend or permission changes. Remaining: true usability and visual audit in authenticated Preview, communication workspace, safe draft recovery, useful help, real performance. Preview was observed returning 403 in browser; no authenticated visuals verified.

## Third revision
- Dedicated agency-only two-pane communications, selected thread constrained to existing tenant-scoped results. Existing message action, rate limit, and authorization unchanged. Read-marking stays explicit; old shared inbox action redirects to a now-supported agency tab alias.
- Dossier milestones based on persisted history and live status, no simulated travel stage; draft has no submitted timeline; cancelled stops at actual reached milestones. Net amount label reflects adjustments.
- Stable branch hostname and Managed Turnstile configured in Vercel only. Cloudflare Preview widget needs exact hostname added by account owner. Explicit build policy denies automatic DB writes on branch. No production change. Authenticated visual acceptance outstanding.
