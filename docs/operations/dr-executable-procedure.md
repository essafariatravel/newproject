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

## Generate the recovery key

Use the repository helper on the trusted operator machine:

```text
npm run dr:key -- --output <absolute-private-path>/essafaria-recovery.dr-key
```

The key file is created exclusively with private permissions, the key is never printed, `*.dr-key` is ignored by Git, and the repository safety gate fails if a DR key is ever tracked. Keep this file separately from the encrypted backup.

## Resolve the exact Production Vercel release

```text
VERCEL_TOKEN=<read token authorized for the ESSAFARIA Vercel team>
npm run dr:release-resolve
```

The resolver performs read-only Vercel API calls only. It resolves project `newproject` under the ESSAFARIA team, filters READY production deployments, confirms the custom alias `visa.essafariavoyages.com`, and returns the deployment's exact full Git SHA.

Do not continue with a guessed release SHA. A missing/unauthorized token is a hard blocker for this resolution step.

## Read-only Production preflight

Before backup creation:

```text
npm run dr:prod-preflight
```

Use the same Production source environment required by `dr:backup`. The command opens a read-only transaction and returns `READY_FOR_BACKUP` only if the source identity, critical tables, migration ledger, pgcrypto hashing, wallet chain, document/blob references and terminal decision evidence are internally consistent.

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

## Verify the independent off-site copy

After an authorized operator has copied the encrypted archive to a genuinely independent controlled destination, retrieve or mount that copy and run:

```text
npm run dr:offsite-verify -- \
  --manifest <created manifest> \
  --copy <independent encrypted copy> \
  --location-ref <opaque internal storage-location ID> \
  --evidence-output <absolute private evidence JSON path>
```

Provide the same recovery key through `DR_BACKUP_KEY_BASE64`; do not place it on the command line.

The verifier checks:

- copied file byte size against the source manifest;
- SHA-256 identity against the source manifest;
- AES-256-GCM authentication/decryption viability with the separately held key;
- source manifest identity;
- output evidence is private and outside the repository.

It prints an `OFFSITE-<sha256>` evidence reference for audit display, while `dr:finalize` consumes the evidence JSON itself and verifies its binding. This verifies the copy once it is available locally; it does **not** choose the storage provider or perform the independent transfer.

## Run the full synthetic DR drill

```text
npm run dr:local-drill
```

This local-only drill never contacts Production. It starts PostgreSQL 17, applies the real migration set, creates synthetic wallet/storage signals, produces a real custom-format dump, encrypts it, restores it into a second fresh database, runs the real restore verifier, verifies an independent synthetic copy, and exercises evidence-bound finalization to `VERIFIED`.

The DR GitHub Actions gate runs this drill automatically. Passing it proves the recovery machinery works end-to-end on synthetic data; it does not replace a restore of the actual Production backup.

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

## Verify the deployed recovery application and tenant isolation

After `dr:restore` succeeds, point a disposable application deployment at that exact restored database and use the backup's exact `source.releaseSha`.

Then run:

```text
DR_ENVIRONMENT=RESTORE_TEST
DATABASE_SCHEMA=visa_os
DATABASE_URL=<same disposable restore>
DR_RESTORE_RELEASE_SHA=<exact backup source.releaseSha>

npm run dr:app-verify -- \
  --manifest <private CREATED manifest> \
  --restore-evidence <private restore evidence JSON> \
  --base-url <HTTPS recovery deployment URL> \
  --target-ref <opaque recovery deployment ID> \
  --application-evidence-output <absolute private application evidence JSON> \
  --tenant-evidence-output <absolute private tenant evidence JSON>
```

For remote disposable Supabase, also supply the same `DR_ALLOW_REMOTE_DISPOSABLE=true` and `DR_DISPOSABLE_PROJECT_REF` used during restore.

This verifier creates random one-hour session tokens in the disposable restore only, confirms the real deployment resolves them, performs Staff/Agency read checks, performs cross-tenant denial checks, then removes the temporary session rows. It never needs or prints user passwords.

A successful document download may append an audit event to the disposable restore. Business data is not modified.

The real Production hostname and Production database project are refused.

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
  --offsite-evidence <off-site evidence JSON from dr:offsite-verify> \
  --application-evidence <application recovery evidence JSON> \
  --tenant-evidence <tenant-isolation evidence JSON> \
  --output <absolute private output path outside repository> \
  --attest-external-evidence-reviewed
```

The finalizer refuses to proceed unless:

- the source manifest is structurally valid and still CREATED;
- the restore evidence is bound to the exact source manifest by SHA-256;
- the restore evidence belongs to the same backup ID and schema;
- the restore target is local or explicitly disposable, never Production;
- database, wallet and storage restore verification all passed;
- the off-site evidence is cryptographically bound to the exact manifest and encrypted copy;
- the application evidence is bound to the exact restore-evidence SHA and every required application recovery check passed;
- the tenant-isolation evidence is bound to the same restore and every required cross-tenant denial check passed;
- the operator explicitly attests that those external checks were reviewed;
- final verification occurs after the restore.

Only then is a new private manifest written with status `VERIFIED`.

This is traceability, not magic proof: an operator must not use the attestation flag unless the referenced evidence really exists and was reviewed. The repository intentionally cannot invent those external facts.


## Restored application / tenant validation compatibility

`npm run dr:app-verify` supports both the current Production identity schema through migration `0019` and the hardened `0020+` identity/session columns by inspecting the restored schema before creating recovery-only sessions.

The runtime verifier does not require a dedicated `/api/session` endpoint. It proves the generated recovery sessions by opening protected Staff and Agency pages that exist in the release line.

If the restore contains only one usable agency tenant, the verifier may create a temporary synthetic second agency/user **only inside the disposable recovery database**, exercise foreign dossier/document/wallet/mutation denial, record the fixture source in tenant evidence, and clean up the temporary session/user/agency on exit. Production is never modified by this fallback.


## Offline status, evidence bundle and final release gate

At any point after a CREATED manifest exists:

```text
npm run dr:status -- --manifest <manifest> [evidence options...]
```

The stages are `CREATED_NEEDS_EVIDENCE`, `READY_TO_FINALIZE`, `EVIDENCE_INVALID`, `VERIFIED_FRESH`, `VERIFIED_STALE` or `INVALID`.

After finalization:

```text
npm run dr:evidence-bundle -- \
  --source-manifest <CREATED manifest> \
  --verified-manifest <VERIFIED manifest> \
  --restore-evidence <restore evidence> \
  --offsite-evidence <off-site evidence> \
  --application-evidence <application evidence> \
  --tenant-evidence <tenant evidence> \
  --output <absolute private bundle path>
```

The bundle contains only hashes, opaque recovery references and boolean results; it does not embed secrets or customer PII.

Then:

```text
npm run dr:release-gate -- \
  --verified-manifest <VERIFIED manifest> \
  --evidence-bundle <bundle> \
  --expected-release-sha <40-character release SHA> \
  --max-age-hours 24
```

Only `status: PASS` clears the final repository-side DR release gate.

## Synthetic fault injection and real application E2E

The CI drill now builds the real Next.js application, restores a real encrypted PostgreSQL custom dump, starts `next start` against the restored database, and invokes the same runtime verifier used for an external recovery deployment.

The drill also proves that:

- a one-byte mutation of the encrypted archive fails AES-256-GCM authentication;
- a database blob changed to different bytes with the same size fails manifest storage digest comparison;
- a tampered row-count manifest fails exact restore comparison;
- Staff/Agency sessions generated only in the restore resolve through the application;
- own dossier/document/wallet reads work;
- foreign dossier/document/wallet/mutation probes are denied;
- temporary recovery sessions/fixtures are removed before evidence is written;
- 0019 and 0020+ identity/session shapes are both supported by tested policy;
- the final VERIFIED manifest, evidence bundle and release gate all agree.
