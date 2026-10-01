# Isolated Preview copy review

Read-only metadata verification on 2026-10-01 confirmed project `xgetzgixalrsmuvfthpf`, schema `visa_os_preview`: 32 application tables, 63 foreign keys, no cross-schema foreign keys, five user triggers, two wallet sequences, and the exact application ledger through `0019_config_translations.sql`. This review executed no hosted writes. Production remains outside this plan.

For an isolated candidate `visa_os_hardening_20261001`, rebuild schema behavior using migrations 0001–0019, then copy data, then apply 0020–0024. A `CREATE TABLE ... LIKE ... INCLUDING ALL` copy is insufficient for foreign keys, triggers and schema-local functions. The baseline migration runner must be capped at 0019 for the reconstruction stage; do not run the current full migration directory before copying old data, because the new decision/top-up guards can reject historical inserts.

First create a separate private, logged data restore-point schema from one `REPEATABLE READ` transaction. Snapshot every source table, including ledger, sessions/presence, activation capabilities, audit rows and blobs. Capture original constraints, trigger definitions, function definitions, column definitions, indexes, sequence definitions/state, grants and migration-file checksums separately. The backup must have no `PUBLIC`, `anon` or `authenticated` access and should have RLS enabled without public policies. Include snapshot identity/time and source/backup row counts/checksums in a manifest. The rows and schema metadata must be enough to test a complete restore; CTAS data alone is not a complete database backup. [CTAS](https://www.postgresql.org/docs/current/sql-createtableas.html) copies a query's columns/data; [Repeatable Read](https://www.postgresql.org/docs/current/transaction-iso.html) gives a stable transaction snapshot.

Copy from the committed backup tables, rather than rereading the changing source. Before copying, remove only the fresh migration-generated target seed configuration in dependency order, leaving the migration ledger. Migrations 0004–0006 insert system codes with new UUIDs; copying source rows on top will otherwise fail unique constraints or retain the wrong references. The target must be proven fresh, isolated, and not used by a deployment before any such target cleanup. No source deletion/update or trigger disabling is needed.

The live foreign-key metadata gives this parent-before-child insertion order:

```text
agencies
countries
currencies
document_blobs
document_types
priorities
statuses
visa_categories
status_transitions
users
visa_types
agency_registrations
applications
audit_logs
site_settings
visa_requirements
agency_registration_documents
agency_registration_history
applicants
application_status_history
checklist_items
communications
notifications
wallet_transactions
application_price_adjustments
documents
wallet_topup_requests
document_requests
```

Use explicit source/target column lists and preserve UUIDs, password hashes, human references, immutable history and blob bytes. Do not return these row values in tooling output. Keep the reconstructed target migration ledger. Intentionally omit old `sessions`, `session_presence`, and preferably old `account_activation_tokens` from the running candidate; preserve them only in the private backup and record the count differences. Issue fresh candidate access links rather than carrying active capabilities between environments.

After copying explicit `WLT-YYYY-NNNNNN` and `TOP-YYYY-NNNNNN` references, resync **only the target** `wallet_reference_seq` and `wallet_topup_reference_seq` above the maximum retained numeric reference. Migration 0015 resyncs while rebuilding, before copied rows exist; that earlier pass cannot prevent a collision after copying. The new candidate schema may need a fresh application-reference sequence if its local application schema has one; verify the actual metadata rather than assuming.

Validate copied per-table counts/checksums against the backup, with an explicit exclusion manifest. Confirm all foreign keys and trigger functions reference the target schema, no function/default uses another schema's sequence, and no `anon`/`authenticated`/`PUBLIC` schema access exposes copied data. Apply 0020–0024 only to the candidate. Verify its ledger, DB health, usernames, session limits, full auth/tenant/business flows and private file access on the candidate deployment. Verify the original Preview and Production ledgers/counts remained unchanged using read-only checks. The candidate remains a preproduction environment; no Production release authorization is created by this copy.
