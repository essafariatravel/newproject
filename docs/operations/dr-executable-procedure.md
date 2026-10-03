# ESSAFARIA DR — Executable backup and isolated-restore procedure

This file is operational guidance for the scripts already present on the DR branch. It contains no credentials.

## Current provider constraint

On 2026-10-03 the connected Supabase organization reports the Free plan.

Current Supabase documentation states:

- managed daily backups are provided for Pro, Team and Enterprise projects;
- Free projects should regularly export data and maintain off-site backups;
- PITR is available on Pro, Team and Enterprise as an add-on.

Therefore the current ESSAFARIA recovery baseline cannot assume provider daily backups or PITR.

Provider documentation:

- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/docs/guides/platform/manage-your-usage/point-in-time-recovery

## Create the encrypted backup

Use `npm run dr:backup`.

Required environment variable names:

- `DR_BACKUP_ENVIRONMENT=PRODUCTION`
- `DR_STORAGE_MODE=DATABASE_BLOBS`
- `DR_RELEASE_SHA` — exact Production release identifier
- `DATABASE_SCHEMA=visa_os`
- one approved Production PostgreSQL connection variable
- `DR_BACKUP_KEY_BASE64` — 32 random bytes encoded as base64

Pass only the output directory as a command argument:

```text
npm run dr:backup -- --output-dir <absolute private directory outside the repository>
```

The creator:

- pins the approved Production Supabase project and schema;
- refuses Vercel runtime execution;
- refuses external-object storage mode until a real object exporter exists;
- uses a repeatable-read, read-only source snapshot;
- records migration, row-count, sequence and blob-inventory evidence;
- uses `pg_dump` and validates that its major version is not older than the database server;
- creates an AES-256-GCM authenticated encrypted archive;
- verifies that encrypted archive before accepting it;
- records SHA-256 evidence;
- removes the temporary plaintext dump;
- produces a manifest with state `CREATED`, never `VERIFIED`.

Keep the encryption key in a different controlled location from the archive.

## Restore the encrypted backup

Use `npm run dr:restore` only against a fresh local database or explicitly approved disposable Supabase project.

Required target identity:

- `DR_ENVIRONMENT=RESTORE_TEST`
- `DATABASE_SCHEMA=visa_os`
- `DATABASE_URL` points to the fresh disposable target
- `DR_BACKUP_KEY_BASE64` contains the recovery key

Remote disposable Supabase additionally requires:

- `DR_ALLOW_REMOTE_DISPOSABLE=true`
- `DR_DISPOSABLE_PROJECT_REF` equal to that non-Production project

Run:

```text
npm run dr:restore -- --manifest <private manifest path>
```

The encrypted dump preserves the source schema name. Therefore the automated restore uses the schema name `visa_os` inside a **separate recovery database/project**. The target identity, not the schema label alone, determines whether the target is Production.

The restore command:

- refuses the real Production Supabase project;
- refuses deployed/Vercel runtime targets;
- checks manifest source identity;
- checks encrypted artifact filename, byte size and SHA-256;
- authenticates/decrypts the archive;
- refuses a target where the schema already exists;
- runs `pg_restore` without `--clean`;
- runs the read-only wallet/storage/schema verifier after restore;
- instructs the operator to discard the entire disposable target if restore partially starts and later fails.

## Verify an already prepared restore

When a recovery database has been prepared by another controlled procedure:

```text
npm run dr:restore-verify
```

The environment must still explicitly identify `RESTORE_TEST` and a safe target.

The verifier never repairs data. Any finding remains a failure requiring investigation.

## Manifest states

`npm run dr:manifest -- --manifest <path> --source production` returns:

- `INVALID`: malformed, wrong source, impossible evidence chronology, or failed safety contract;
- `CREATED`: archive exists but external/restore/application evidence remains incomplete;
- `VERIFIED`: all mandatory backup, isolated restore, wallet, storage, application/tenant-isolation and off-site evidence is recorded.

The go-live reset planner additionally requires VERIFIED evidence no older than 24 hours.

## Evidence still external

Repository code cannot self-prove:

- independent/off-site copy completion;
- encryption-key custody/recovery outside the repository;
- application login/read behavior on the restored target;
- tenant-isolation browser/application checks against the restored target;
- Owner authorization for any future Production restore/reset.

Those are the remaining operator proofs, not missing recovery architecture.


## Finalize a backup as VERIFIED

After `dr:restore` succeeds, it writes a private restore-evidence JSON and prints its SHA-256.

The backup still remains CREATED until the external recovery checks are actually reviewed:

- independent/off-site copy;
- application login/read behavior on the restored target;
- cross-tenant/tenant-isolation behavior on the restored target.

Give each reviewed evidence package an opaque internal reference (for example an incident/drill evidence ID, not a path, URL, secret or free-form note), then run:

```text
npm run dr:finalize -- \
  --manifest <created manifest> \
  --restore-evidence <restore evidence JSON> \
  --offsite-ref <opaque off-site evidence ID> \
  --application-ref <opaque application recovery evidence ID> \
  --tenant-ref <opaque tenant-isolation evidence ID> \
  --output <absolute private output path outside repository> \
  --attest-external-evidence-reviewed
```

The finalizer refuses to proceed unless:

- the source manifest is structurally valid and still CREATED;
- the restore evidence is bound to the exact source manifest by SHA-256;
- the restore evidence belongs to the same backup ID and schema;
- the restore target is local or explicitly disposable, never Production;
- database, wallet and storage restore verification all passed;
- all three external evidence references are syntactically valid;
- the operator explicitly attests that those external checks were reviewed;
- final verification occurs after the restore.

Only then is a new private manifest written with status `VERIFIED`.

This is traceability, not magic proof: an operator must not use the attestation flag unless the referenced evidence really exists and was reviewed. The repository intentionally cannot invent those external facts.
