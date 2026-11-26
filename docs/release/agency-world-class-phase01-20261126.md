# Agency World-Class Engineering — Phase 01 qualification

Status: NO-GO for Production pending exact release validation and end-to-end evidence.

## Baseline and environment
- Production deployment shown by the authenticated Vercel dashboard: 2Tpuc25TWsWcqbsRMkyznZiD7dVR, commit 0f65d09b606f9b43980aa3bb0671899765b148b3, branch codex/urgent-hotfix-registration-unique-email-20261121. Confirm again immediately before release; dashboard observation is not an immutable live-domain attestation.
- Starting Preview: b04a149e61e1e707816af8571d78414aeb29c1dc, branch codex/agency-experience-2-0-preview-20261124. 141 commits ahead, 0 behind the observed Production source.
- Read-only SQL on 2026-11-26: visa_os has 39 ledger entries; visa_os_preview has 43. Both include 0040 and 0041 and the cancellation table and indexes. Preview's four extra entries are 0036–0039 VFS-related. Ledger presence is not by itself proof of every constraint, grant or runtime invariant.
- The branch's build-policy explicitly prohibits automatic migrations and seed. No migration, environment change, production promotion, test fixture write to hosted databases or new paid resource is authorized by this phase.

## Phase 01
- Replace invalid bank support destination with authenticated Partner Care.
- Group active catalogue requirement reads; preserve empty vs failed read distinction. Final submission's authoritative server validation unchanged.
- Batch temporary upload reads with existing agency/user/attempt prefix, count, duplicate, format, expiry and programme checks; preserve token order.
- Reuse successful staging receipts only in memory, same file identity and slot, five minutes maximum; clear after a final-commit error or session/catalogue error. Keep sequential uploads and unchanged attempt key; no new persistence.
- Paginate recharge history 25 per page, with status, literal reference search and UTC date bounds; pending state read separately from filtered list; skip unused ledger reads.
- Parallelize independent authenticated layout reads; no shared private cache.
- Add regression tests. Full suite must use a disposable local database, not either hosted schema.
- Multi-tab polling sharing, concurrent upload transfer, broad CSS refactor and persistent drafts are deferred until isolated tests and privacy review.

## Release gates
1. Reconfirm Production deployment ID and SHA and diff the exact candidate; check the historical 0041 migration and Production ledger39 gate without executing migrations.
2. Run locked dependencies, typecheck, lint, build, Vitest and isolated E2E. Test cross-tenant documents, roles, expiry, cancellation/refunds, wallet reconciliation and request replay including lost network response. Record actual metrics; no load against hosted production.
3. Verify FR/EN/AR and mobile layouts, support route, recharge filters and >25 records, profile preferences and keyboard navigation.
4. Stage only after owner authorization. Review rollback compatibility: the older code must not bypass cancellation constraints. Record the current deployment and backup/recovery evidence. A successful Vercel build alone is not a GO.
5. Owner approval is mandatory before promotion. No new migrations or charges without separate approval.

## Source diff manifest (candidate tree before this documentation and final wallet/test refinements)
Compared to observed Production: 141 changed paths, including historical 0041. No file is deleted. This is a tree-level inventory, not a semantic certification of all changes.
- MODIFY .agents/skills/essafaria-product-design/SKILL.md
- ADD .github/workflows/cancellation-financial-qualification.yml
- ADD docs/agency-experience-2.0.md
- MODIFY essafaria-private-stage-readonly.mjs
- ADD migrations/0041_application_cancellation_requests.sql
- MODIFY public/sw.js
- MODIFY scripts/build.ts
- MODIFY scripts/lib/build-policy.ts
- ADD scripts/verify-session-inactivity.ts
- ADD src/app/(public)/change-password/account-password.css
- MODIFY src/app/(public)/change-password/change-password-form.tsx
- MODIFY src/app/(public)/change-password/page.tsx
- ADD src/app/actions/cancellations.ts
- MODIFY src/app/admin/applications/[id]/page.tsx
- ADD src/app/api/agency/cases/[id]/decision/route.ts
- ADD src/app/api/agency/cases/[id]/messages-read/route.ts
- ADD src/app/api/agency/cases/count/route.ts
- ADD src/app/api/agency/cases/search/route.ts
- ADD src/app/api/agency/dashboard-search/route.ts
- MODIFY src/app/api/agency/requests/route.ts
- MODIFY src/app/api/documents/[id]/route.ts
- MODIFY src/app/api/notifications/route.ts
- MODIFY src/app/api/session/route.ts
- MODIFY src/app/globals.css
- ADD src/app/portal/agency-v2.css
- MODIFY src/app/portal/applicants/page.tsx
- ADD src/app/portal/applications/[id]/dossier.css
- ADD src/app/portal/applications/[id]/loading.tsx
- MODIFY src/app/portal/applications/[id]/page.tsx
- ADD src/app/portal/applications/agency-command.tsx
- ADD src/app/portal/applications/case-conversation-motion.tsx
- ADD src/app/portal/applications/case-filters.tsx
- ADD src/app/portal/applications/case-messages-read.tsx
- ADD src/app/portal/applications/case-navigation.tsx
- ADD src/app/portal/applications/case-quick-view.tsx
- ADD src/app/portal/applications/case-range-calendar.tsx
- ADD src/app/portal/applications/case-select-field.tsx
- ADD src/app/portal/applications/case-selection.tsx
- ADD src/app/portal/applications/case-workspace.ts
- ADD src/app/portal/applications/cases.css
- ADD src/app/portal/applications/copy-case-reference.tsx
- ADD src/app/portal/applications/document-action-model.ts
- ADD src/app/portal/applications/document-viewer.tsx
- ADD src/app/portal/applications/document-workspace.tsx
- ADD src/app/portal/applications/journey-motion.tsx
- ADD src/app/portal/applications/live-case-duration.tsx
- ADD src/app/portal/applications/loading.tsx
- MODIFY src/app/portal/applications/new/page.tsx
- MODIFY src/app/portal/applications/new/request-wizard.tsx
- MODIFY src/app/portal/applications/page.tsx
- ADD src/app/portal/applications/smart-document-upload.tsx
- ADD src/app/portal/applications/smart-timeline.tsx
- ADD src/app/portal/communications/communication-workspace.tsx
- MODIFY src/app/portal/communications/page.tsx
- ADD src/app/portal/dashboard-interactions.tsx
- ADD src/app/portal/dashboard-search.ts
- ADD src/app/portal/dashboard-smart-search.tsx
- ADD src/app/portal/dashboard-smart.ts
- ADD src/app/portal/dashboard.css
- MODIFY src/app/portal/documents/page.tsx
- ADD src/app/portal/home-case-tools.tsx
- ADD src/app/portal/home-destinations.tsx
- ADD src/app/portal/home-editorial.tsx
- MODIFY src/app/portal/layout.tsx
- ADD src/app/portal/notifications/notification-actions.ts
- ADD src/app/portal/notifications/notification-copy.ts
- ADD src/app/portal/notifications/notification-interactions.tsx
- ADD src/app/portal/notifications/notification-signature.ts
- MODIFY src/app/portal/notifications/page.tsx
- MODIFY src/app/portal/page.tsx
- ADD src/app/portal/profile/loading.tsx
- MODIFY src/app/portal/profile/page.tsx
- ADD src/app/portal/profile/profile-actions.ts
- ADD src/app/portal/profile/profile-care.tsx
- ADD src/app/portal/profile/profile-copy.ts
- ADD src/app/portal/profile/profile-extras.tsx
- ADD src/app/portal/profile/profile-interactions.tsx
- ADD src/app/portal/profile/profile-r03-utils.ts
- ADD src/app/portal/profile/profile.css
- ADD src/app/portal/profile/use-profile-dirty.ts
- MODIFY src/app/portal/wallet/page.tsx
- ADD src/app/portal/wallet/wallet-interactions.tsx
- MODIFY src/components/account-menu.tsx
- ADD src/components/agency-popover-controller.tsx
- ADD src/components/agency-popover-policy.ts
- MODIFY src/components/app-shell.tsx
- MODIFY src/components/application-detail.tsx
- MODIFY src/components/bank-accounts.tsx
- ADD src/components/cancellation-actions.tsx
- ADD src/components/cancellation-panel.tsx
- ADD src/components/case-message-templates.tsx
- MODIFY src/components/date-picker.tsx
- MODIFY src/components/live-notifications.tsx
- MODIFY src/components/nav-list.tsx
- MODIFY src/components/notifications-page.tsx
- MODIFY src/components/session-activity.tsx
- MODIFY src/components/topup.tsx
- ADD src/lib/agency-notification-bell.ts
- ADD src/lib/agency-notification-center.ts
- ADD src/lib/agency-preference-values.ts
- ADD src/lib/agency-preferences.ts
- ADD src/lib/agency-profile-security.ts
- ADD src/lib/application-cancellations.ts
- MODIFY src/lib/applications.ts
- MODIFY src/lib/business-labels.ts
- ADD src/lib/case-document-read-model.ts
- ADD src/lib/case-vfs-reference.ts
- MODIFY src/lib/i18n-content.ts
- MODIFY src/lib/identity-policy.ts
- MODIFY src/lib/inbox.ts
- ADD src/lib/notification-search.ts
- MODIFY src/lib/queries.ts
- ADD src/lib/request-upload-retry.ts
- MODIFY src/lib/request-uploads.ts
- MODIFY src/lib/requests.ts
- MODIFY src/lib/session-security.ts
- ADD src/lib/session-warning-copy.ts
- MODIFY src/lib/topup.ts
- MODIFY tests/agency-idle-timeout.test.ts
- ADD tests/agency-notification-search.test.ts
- ADD tests/agency-popover-policy.test.ts
- ADD tests/agency-profile-r01.test.ts
- ADD tests/agency-profile-r02.test.ts
- ADD tests/agency-profile-r03.test.ts
- ADD tests/agency-profile-security.test.ts
- ADD tests/application-cancellations.test.ts
- ADD tests/case-productivity.test.ts
- ADD tests/case-revision-07-search.test.ts
- ADD tests/case-revision-07.test.ts
- ADD tests/case-workspace.test.ts
- ADD tests/dashboard-smart.test.ts
- ADD tests/document-action-model.test.ts
- ADD tests/intelligent-case-workspace.test.ts
- ADD tests/notification-signature.test.ts
- MODIFY tests/price-adjustments-22.test.ts
- MODIFY tests/profile-financial-visibility.test.ts
- MODIFY tests/request-23.test.ts
- ADD tests/request-upload-retry.test.ts
- MODIFY tests/request-uploads.test.ts
- ADD tests/session-warning-i18n.test.ts
- MODIFY tests/topup.test.ts
