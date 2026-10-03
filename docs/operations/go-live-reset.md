# Go-live cleanup review

This release supplies a read-only plan. `scripts/reset.ts` contains no deletion, reset, seed, storage write, or execution path. `--execute`, `--force`, `--yes`, and `--confirm` are rejected before opening a database connection. Production, hosted execution, remote targets, and the `visa_os` schema are refused. This document does not authorize a future reset.

The earlier `db:reset` command dropped the public schema. It has been replaced. Planning is now performed against an explicitly configured disposable localhost restore snapshot. The default is dry-run; an offline blueprint does not open any connection:

```powershell
npm run db:reset -- --blueprint
npm run db:reset -- --dry-run --preserve-user APPROVED_REAL_STAFF_UUID --backup-manifest ./work/backup-manifest.json
```

For the second command, inject the local snapshot's `DATABASE_URL` and `DATABASE_SCHEMA` securely into the process. Repeat `--preserve-user` for every approved real Staff member. Do not put a password or a connection URI in command arguments, checked-in files, reports, or chat. The CLI does not load private env files itself.

The JSON inventory reports counts for all application tables, proposed child-before-parent order from actual foreign keys, approved Staff UUIDs, active Super Admin count, system primitive counts, protected table dependencies, unknown tables, and object reference/blob counts. It does not read customer file contents, print file keys, or fetch external storage. A dependency cycle is reported as a blocker instead of proposing an unsafe order. Counts are planning evidence; no after-reset report is produced because nothing is removed.

## Approval and preservation

The owner must approve the exact target, real Staff UUIDs, test-versus-launch classification, archive policy, storage manifest, and later executor. Retain at least one active real `SUPER_ADMIN`. Proposed cleanup of `users` means only unapproved test identities; it never means deleting the preserved UUIDs. The future executor must recheck their current role, status, credentials and tenant association immediately before committing.

Retain core statuses, valid transitions, system decision document types, essential priorities, DZD primitives, launch-approved catalogue/settings, every approved legal version, and required audit authors. Unknown tables and unclassified configuration remain preserved. A future execution must fail if protected counts change unexpectedly or a retained account belongs to a removed agency.

Operational scope includes test registrations, agencies, agency users, applications, applicants, dossier/decision files, communications, notifications, requests, top-ups, wallet entries, price adjustments, sessions, presence, activation/reset tokens and recovery queues. Immutable audit/financial triggers can block deletion or foreign-key `SET NULL`; the future executor needs an explicit archive/removal design and separate owner approval. Do not disable these triggers on an existing application schema to force a cleanup through.

## Backup and isolated restore

Before any future removal, obtain an encrypted database backup plus the schema definitions, migration ledger, sequences and storage-object manifest. A CTAS table snapshot preserves rows and bytes; it does not preserve original constraints, indexes, triggers or function definitions. The restore procedure must reconstruct these too. Use one consistent database snapshot for the complete backup. [PostgreSQL documents CTAS behavior](https://www.postgresql.org/docs/current/sql-createtableas.html) and [transaction snapshot isolation](https://www.postgresql.org/docs/current/transaction-iso.html).

The following are operator examples only; this task has not executed them. Provision connection settings through a protected PostgreSQL service/passfile or process environment. `PGSERVICE`/`PGPASSFILE` hold configuration securely without embedding credentials in these command lines. Verify the source schema and the localhost restore target independently.

```powershell
# Read-only source export; choose a private backup directory and encrypted volume.
pg_dump --format=custom --no-owner --no-acl --schema visa_os_preview --file ./work/preview-before-cleanup.dump
Get-FileHash -Algorithm SHA256 -LiteralPath ./work/preview-before-cleanup.dump
pg_restore --list ./work/preview-before-cleanup.dump > ./work/preview-backup-index.txt

# Restore only into a NEW disposable localhost database. Confirm its host first.
# Configure the local PostgreSQL service/passfile before this operator-only step.
pg_restore --exit-on-error --no-owner --no-acl --dbname essafaria_restore_check ./work/preview-before-cleanup.dump
```

Encrypt the export with the owner's approved encryption tool before moving or archiving it; restrict its filesystem ACL while it is plaintext and record its SHA-256. Test the restore, compare per-table counts and key financial/configuration checksums, check constraints/triggers/functions and sequence continuity, and confirm the preserved Super Admin can sign in. Do not restore into `visa_os`, an existing Preview, or an unrelated schema. Capture actual results; an archive filename is not proof of restoration.

The reset planner now accepts only the versioned DR manifest contract documented in
`docs/operations/disaster-recovery.md`. A manifest is not an owner assertion: the
repository classifies it as `INVALID`, `CREATED`, or `VERIFIED`, and the
go-live reset backup prerequisite remains blocked unless it is `VERIFIED`.

Use the checked-in example only as a schema/template; it is intentionally not
verified:

```powershell
npm run dr:manifest -- --manifest ./work/backup-manifest.json --source production
```

A VERIFIED manifest requires encrypted database/storage evidence, checksum and
schema checks, an isolated restore, wallet reconciliation, storage
reconciliation, tenant-isolation/application checks, and an independently
verified off-site copy. The reset planner never trusts a filename or a successful
backup command as restoration proof.

For the database storage provider, the dump must include `document_blobs` bytes. For external Supabase Storage, a database backup retains metadata, not the actual objects; keep a separately encrypted object export and checksum/version manifest. [Supabase's restore guide](https://supabase.com/docs/guides/platform/migrating-within-supabase/dashboard-restore) describes this distinction. Retain approved branding/logos and uncertain objects. A later storage cleanup should use an idempotent queue after the database commit, retry failures, and reconcile against live references; database and object storage do not share a transaction.

## Required eventual result

Record owner authorization, target fingerprint, backup/restore evidence and before/after counts. The approved go-live report must show zero test agencies, agency users, applications, applicants, operational documents, messages, top-ups, wallet test entries, test registrations and synthetic sessions/tokens. Confirm protected Staff/system/configuration/legal records remain, all foreign keys are valid, historical references are archived, and object storage matches the approved manifest. The current release produces only the before-inventory and proposed verification checklist.
