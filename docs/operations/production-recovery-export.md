# Production export route — authorization proposal, not an executable change

Target for a later approved operation: project `xgetzgixalrsmuvfthpf`, database `postgres`, schema `visa_os`. The last controlled attempt stopped before `pg_dump`: session pooler did not demonstrate `default_transaction_read_only=on` despite startup options. Direct IPv6 from this workstation was unreachable. Do not change the guard or the database-wide read-only default.

## Qualified local alternative

A synthetic local 0019 database was dumped, actually restored, migrated through 0035 and checked for rollback/idempotence/RLS. A new local role with no superuser, create-role, create-database, replication or RLS-bypass capability received only schema USAGE, table SELECT and sequence SELECT. Its role default was read-only. Writes failed with SQLSTATE 25006; after changing only the synthetic session setting, writes still failed with 42501. Export with `pg_dump --enable-row-security` was encrypted/decrypted in memory and actually restored; every table/column row digest matched. This proves a local route, not Supabase/Production recovery.

## Proposed shared changes requiring specific approval

Prepare a new dedicated export role, initially NOLOGIN, with the above restricted attributes, no memberships and no password in SQL/logs. Grant CONNECT to the named database, USAGE only on `visa_os`, SELECT only on its inventoried tables/sequences and an explicit SELECT policy only to this role for each RLS-enabled table. Set `default_transaction_read_only=on` on that role only. Do not grant BYPASSRLS or global `pg_read_all_data`; do not alter `anon`, `authenticated`, existing application roles, default privileges or public policies.

Before authorization, enumerate effective PUBLIC privileges, SECURITY DEFINER functions, schema CREATE/TEMP privileges, restrictive RLS policies and accessible foreign/external relations. The dedicated role must not inherit an indirect write path. A permissive read policy alone is not proof of complete rows when restrictive policies exist. If qualification requires global revokes or broader changes, stop and present that separate scope. No such live role or policy has been created.

Enable LOGIN and enter a new dedicated credential only through an approved secure local/operator flow. Do not reset an existing credential. Verify the new role is supported on the official session-pooler route; if its default read-only state is not effective on fresh connections, stop. Do not terminate unidentified pooler connections or buy IPv4 automatically.

## Backup acceptance

Require verified TLS/hostname, exact project/DB/schema identity, role attributes/effective privileges, `default_transaction_read_only=on` and `transaction_read_only=on` on both controller and export connections. Use a stable read-only snapshot, with matching snapshot import by the exporter; capture schema/object/migration hashes and row/byte digests from that same snapshot. Include all schema objects, sequences, function/trigger definitions, ACL/RLS and separately required role metadata without passwords. Check dependency completeness; `--schema` alone does not include every external dependency.

Stream a custom-format archive directly into authenticated encryption using the approved recovery recipient; reject broken pipes or any failed process. Persist only ciphertext and non-sensitive proof. Cover object bytes as a separate encrypted set with hashes; a database backup contains Storage metadata, not file payloads. Unmapped external objects remain a coverage blocker.

Then verify ciphertext length/hash and decrypt into an isolated PostgreSQL target with no cloud write credentials. Restore real archived data and compare snapshot digests, migrations, sequences, functions, constraints, RLS and ACL. Verify application behavior and an actual honest MFA-compatible recovery path. Never stamp a password probe as MFA verified. Verify off-site retrieval and the required recovery custody independently; existing owner-managed unencrypted Preview custody is not evidence of independent Production custody.

Only this full evidence chain may produce Production RESTORE_PASS. Until then: no Production cleanup, migration, account removal or release. Existing older administrators stay available until the new owner administrator has passed real password login, TOTP enrollment/challenge, a new MFA session and recovery.

Primary references: [Supabase connection methods](https://supabase.com/docs/guides/database/connecting-to-postgres), [PostgreSQL pg_dump and row security](https://www.postgresql.org/docs/17/app-pgdump.html), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Supabase backup coverage](https://supabase.com/docs/guides/platform/backups).
