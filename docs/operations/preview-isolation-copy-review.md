# Preview isolation and restore evidence

The preproduction master brief authorized migrations only in the verified Preview schema after a backup and restore check. The executed target was Supabase project `xgetzgixalrsmuvfthpf`, schema `visa_os_preview`. Production schema `visa_os` was not written. The deployment continues to use the existing isolated Preview schema; no alternative candidate schema was put into service.

## Verified before migration on 2026-10-01

- Positive project identity, active database, Vercel-linked organization, and existing Preview `DATABASE_SCHEMA=visa_os_preview`.
- Source contained 32 application tables, the migration ledger through `0019_config_translations.sql`, 63 foreign keys and no cross-schema foreign keys.
- A consistent `REPEATABLE READ` snapshot was created in private schema `visa_os_preview_backup_20261001`, preserving every source table, existing UUIDs and password hashes, financial history, sessions, token records and all 77 database-stored blobs. Original DDL and both sequence states were captured with the rows.
- A separate private restore was reconstructed in `visa_os_preview_restorecheck_20261001`. All 32 restored table counts and whole-row checksums matched the snapshot. Both sequences were restored. Definitions matched for 135 constraints, 90 indexes, five triggers and six functions.
- Backup and restore schemas deny schema usage to `PUBLIC`, `anon` and `authenticated`; restored tables have RLS. Customer records and file bytes were not exported into reports or chat.

The restore exercise exposed a baseline migration bug: `0013_embassy_applicability.sql` searched a constraint name globally, causing the constraint to be skipped in a second schema. The restore definition was repaired only in the isolated clone. Migration 0024 now checks the constraint against the selected schema's actual `visa_types` table, and a regression reconstructs two isolated schemas to verify it.

## Preview upgrade and preservation

Migrations 0020-0024 were applied transactionally only with the explicitly selected Preview search path, after the source fingerprint and successful restore were checked. No seed or reset was run. The resulting application ledger contains all 24 files.

Post-migration verification confirmed:

- 47 of 47 existing user UUID/password-hash pairs retained.
- 24 of 24 agency balances retained, with all 43 wallet ledger rows preserved.
- No Agency identity lacks its new normalized username.
- RLS enabled on all application tables, without `anon` or `authenticated` schema access.
- Zero published legal versions, one pre-existing final decision lacking a suitable official document, and three pre-existing dossier storage references lacking database blob content. These were preserved and reported for owner reconciliation rather than silently repaired or removed.

Build policy protects `preprod/essafaria-final-hardening`: automatic migrations, seeding and bootstrap verification are disabled. The legacy Preview administrator bootstrap HTTP endpoint also returns 404 on this protected branch. Subsequent builds and code-only fixes therefore require no further database writes.

## Limits and go-live gates

This is a verified private same-database restore point, not an encrypted off-site disaster-recovery backup. Before an approved go-live cleanup, obtain an encrypted export and storage manifest, test their isolated restore, approve retained real Staff UUIDs and configuration, and resolve archive/foreign-key requirements for immutable financial and audit history. No cleanup execution is available in this release's reset planner.

Hosted public routes, database health, catalogue privacy and denied unauthenticated endpoints were verified. Hosted authenticated workflows were not repeated because no existing credential was available; credentials were not reset and bootstrap was not used for QA. Four-role authenticated functional evidence comes from the optimized local build and disposable synthetic database. Owner sign-in and hosted authenticated acceptance remain required before Production promotion.
