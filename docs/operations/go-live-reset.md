# Guarded pre-production cleanup tooling

The reset command has an executor for explicitly identified disposable localhost snapshots and a separate, opt-in isolated Preview contract. Production remains forbidden. This document grants no permission to run a real reset. Candidate hardening tests use only synthetic records in isolated localhost schemas; Preview verification tests mock HTTPS responses and make no hosted requests.

Production environments, Vercel execution and the visa_os schema are refused before connecting. Remote targets are refused unless the dedicated isolated Preview contract below succeeds. Unsafe aliases --force, --yes and --confirm remain invalid. Read-only dry-run is the default. An explicit --execute request requires a complete reviewed approval manifest; combining execution with --dry-run or --blueprint is refused.

```powershell
# Offline policy: no connection.
npm run db:reset -- --blueprint

# Inventory only: no mutation.
npm run db:reset -- --dry-run --preserve-user APPROVED_STAFF_UUID

# Verify complete execution evidence without mutation.
npm run db:reset -- --dry-run --approval-manifest ./work/owner-reviewed-local-reset.json

# Operator reference only. This task must never execute a real cleanup.
npm run db:reset -- --execute --approval-manifest ./work/owner-reviewed-local-reset.json
```

Supply DATABASE_URL, DATABASE_SCHEMA, STORAGE_PROVIDER=db and a private RESET_BACKUP_KEY through protected process configuration. The key must encode exactly 32 random bytes as base64. Never place credentials, encryption keys, passwords or customer files in command arguments, checked-in files, reports or chat. The CLI does not load private environment files automatically.

Dry-run prints counts, non-secret inventory/definition digests, protected identity counts, backup status and concrete archive/recreation effects. Digesting the local snapshot reads complete table contents, including password hashes and database file bytes, into process memory. Those contents and object keys are not printed. No external storage calls are made.

## Exact target and preservation

The manifest must match the connected database name, schema, actual server address and port, the complete table digest and schema-definition digest. It must name a new archive schema and a separate existing isolated restore schema. Unknown/unclassified tables and foreign keys crossing the target schema in either direction are blockers.

The local authorization purpose is DISPOSABLE_SYNTHETIC_LOCAL_RESET. The owner must attest archive retention, operational-schema recreation, reviewed configuration and exclusive maintenance. This records operational authorization; it does not authenticate the human operator. A future Production reset requires a separate dedicated contract and implementation.

## Dedicated isolated Preview contract — not executed in this task

`--isolated-preview` requires an owner-reviewed approval manifest even for read-only dry-run. Its authorization purpose must be `ISOLATED_PREVIEW_GO_LIVE_CLEANUP`. Include `previewIdentity` with exactly `projectRef`, `schema`, `branch`, `sha`, `vercelProjectId`, `vercelTeamId` and `deploymentId`. The project and schema must be `xgetzgixalrsmuvfthpf` and `visa_os_preview`; the branch must be `preprod/essafaria-final-hardening`. Actual Git branch, clean working tree, full HEAD SHA and GitHub origin `essafariatravel/newproject` must match before any database connection.

Supply `RESET_VERCEL_ACCESS_TOKEN` only through protected process configuration. The tool verifies the exact Vercel project `newproject`, linked GitHub repository, team slug `essafaria-travel-s-projects`, project/team/deployment IDs, READY Preview target and candidate SHA/ref through fixed Vercel HTTPS endpoints. It then checks the verified deployment's public `/api/health` without forwarding authorization. Redirects and arbitrary deployment URLs are refused. No Production fallback exists.

The database URI must use the exact Supabase project and database `postgres`, explicit `sslmode=verify-full`, and no conflicting SSL options or disabled TLS verification. Every schema query and reconstruction remains scoped to `visa_os_preview`. The same encrypted artifact, actual isolated restore, exact connected target, fresh inventory, RLS/ACL, storage, sequence, preservation and maintenance checks apply. All Preview identity fields must also match at plan verification. The new audit event identifies isolated Preview execution separately from synthetic local tests.

Required owner inputs are the real retained Staff/SUPER_ADMIN UUIDs, classified launch catalogue, immutable-history retention approval, current backup/restore artifact, actual Vercel IDs and exact reviewed candidate SHA. Keep the manifest outside the candidate checkout so it does not make the reviewed tree dirty. This continuation did not invoke this mode against hosted infrastructure, and its live acceptance remains outstanding. The current contract supports database blob storage only; unverified external storage refuses execution.

The author must be an explicitly preserved active SUPER_ADMIN. Every preserved identity must be active Staff, have no Agency association, pending activation or required password change, and have a usable scrypt hash format. Exact identities/password hashes survive; credential_version increments. Sessions, presence, activation/access tokens and recovery requests are not copied to the new live schema. Real Staff UUIDs and actual sign-in acceptance remain owner inputs; synthetic tests verify a known password against its preserved hash.

Required active canonical workflow statuses/transitions, official approval/refusal document types restricted from Agency upload, active STANDARD priority and active DZD currency are checked before execution. The migration ledger, system statuses/transitions, document types, priorities, currencies, settings and immutable legal versions require PRESERVE_ALL.

Only countries, visa_categories, visa_types and visa_requirements may use PRESERVE_IDS. Supply a preservedConfigurationIds array for each selected table. IDs must be well formed, unique and present in the whole snapshot. All unselected rows are classified test catalogue data and remain only in the archive/backup. Retained products require retained countries/categories; retained requirements require retained products/document types. Retained settings/legal authors must be preserved Staff. Exact selected rows and their foreign-key dependencies are checked before mutation and before commit; no implicit cascade selects approved rows.

## Actual encrypted bytes and isolated restore

The manifest identifies an actual encrypted artifact, its SHA-256, AES-256-GCM, creation time, successful restore attestation time and isolated restore schema. Times must be valid, ordered and current: the backup may be no older than24hours. A shape-only manifest is insufficient.

The encrypted JSON envelope has version1, algorithm AES-256-GCM, base64 iv (12bytes), tag (16bytes) and ciphertext. The tool checks the actual artifact checksum, then authenticates/decrypts it using the private process key. A recomputed checksum with a tampered authentication tag still fails.

The decrypted payload contains:

- version1 and the exact target object.
- Complete tableRows in sorted table/row order, including blobs and immutable history.
- Matching inventorySha256 and definitionSha256.
- Every sequence's name, dataType, startValue, minValue, maxValue, incrementBy, cycle, cacheSize, ownerTable, ownerColumn, lastValue and isCalled.
- The exact sorted migrations as objects containing name and sql.

The independently restored schema must match all table contents, captured definitions and full sequence definitions/counters. Foreign keys, constraints, indexes, triggers and functions are included in definition comparison. The migration ledger must match the exact migration set. Missing/reset sequences, changed restored rows, tampered encrypted artifacts and changed migration bytes are refused. Keep backup/key separately under approved private access controls. The local archive schema is recoverable database history, not an encrypted offsite backup.

Manifest shape below uses placeholders and abbreviates classifications. A real manifest must classify every inventory table; this example is intentionally not executable.

```json
{
  "version": 1,
  "target": { "database": "DISPOSABLE_LOCAL_DATABASE", "schema": "local_snapshot", "host": "127.0.0.1", "port": 5434 },
  "archiveSchema": "local_snapshot_archive",
  "authorizedBy": "APPROVED_SUPER_ADMIN_UUID",
  "preservedUserIds": ["APPROVED_SUPER_ADMIN_UUID", "APPROVED_STAFF_UUID"],
  "inventorySha256": "ACTUAL_64_CHARACTER_SHA256",
  "definitionSha256": "ACTUAL_64_CHARACTER_SHA256",
  "backup": {
    "path": "ABSOLUTE_PRIVATE_ENCRYPTED_ARTIFACT_PATH",
    "sha256": "ACTUAL_64_CHARACTER_SHA256",
    "algorithm": "AES-256-GCM",
    "createdAt": "ACTUAL_ISO_TIMESTAMP",
    "verifiedRestoreAt": "ACTUAL_ISO_TIMESTAMP",
    "restoreSchema": "local_snapshot_restorecheck"
  },
  "tableClassifications": {
    "schema_migrations": "PRESERVE_ALL",
    "statuses": "PRESERVE_ALL",
    "countries": "PRESERVE_IDS",
    "applications": "REMOVE_OPERATIONAL",
    "audit_logs": "REMOVE_OPERATIONAL"
  },
  "preservedConfigurationIds": { "countries": ["APPROVED_LAUNCH_COUNTRY_UUID"] },
  "storage": { "provider": "db", "removeKeys": ["CLASSIFIED_TEST_KEY"], "preserveKeys": ["APPROVED_BRAND_KEY"] },
  "authorization": {
    "purpose": "DISPOSABLE_SYNTHETIC_LOCAL_RESET",
    "archiveImmutableHistory": true,
    "recreateOperationalSchema": true,
    "configurationReviewed": true,
    "exclusiveMaintenance": true
  }
}
```

## Transaction and storage meaning

Execution obtains an advisory lock and exclusive locks on target tables, then rechecks table/definition/sequence evidence and cross-schema dependencies. One transaction renames the original schema to the approved archive name, reconstructs the operational schema from verified migration bytes, clears only newly created migration defaults, and restores approved Staff, protected/selected configuration and explicitly retained blobs.

Original wallet, adjustment, audit, reconciliation and legal rows are not edited/deleted; immutable triggers are never disabled. Original operational records and file bytes remain recoverable in the archive and encrypted backup. removeKeys means absent from the recreated operational schema, not physically erased from historical archive storage. Approved branding objects remain live. The manifest must partition the entire database blob inventory into disjoint remove/preserve sets.

External Supabase Storage and other external object providers are unsupported. External exports, version/checksum inventory, post-commit deletion/retry and reconciliation require a future approved implementation. A database manifest cannot prove external-object backup or cleanup.

Before commit the executor verifies actual zero operational counts, exact preserved Staff/blob counts, selected configuration contents/dependencies, reconstructed definitions, sequence continuity and unchanged archived contents. One immutable LOCAL_SYNTHETIC_RESET_EXECUTED audit event is written into the new live schema. Failure rolls back the rename/recreation and preserves the original operational schema.

The executed report contains EXECUTED_LOCAL_SYNTHETIC, verified=true, actual afterCounts, approved Staff IDs, active Super Admin count, archive name, storage verification and sequence-continuity result. Live audit count is one reset event; historical audits remain archived. Dry-run counts are never post-reset evidence. New live sessions require normal sign-in; old sessions/tokens remain only historical archive data.

## Legacy reconciliation and remaining acceptance

Migration0025 adds immutable missing-official-document and missing-blob findings/disposition events. Subsequent hardening protects the tables and orders events explicitly. The Staff workflow retains original dossier status, document metadata and financial history. Owner disposition stays unresolved. RESTORED is allowed only when the genuine persisted document/blob meets canonical checks; a later missing object reopens the issue on scan.

The missing original official decision and three missing hosted objects remain owner dependencies. This task fabricates no documents, deletes no legacy dossiers, writes no hosted reconciliation records and runs no real cleanup. Hosted browser acceptance, approved real preservation/catalogue/storage inventory, encrypted offsite backup and real Staff sign-in remain separate owner-controlled acceptance work. No Production, visa_os or hosted reset is authorized or performed.
