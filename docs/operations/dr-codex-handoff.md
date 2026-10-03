# ESSAFARIA VISA OS — Minimal Codex DR Handoff

Branch: `dr/pre-codex-gate-2026-10-03`

Purpose: execute only the external recovery proofs that repository code cannot self-produce.

## Stop conditions

Do **not** redesign DR.
Do **not** write new migrations.
Do **not** change business logic.
Do **not** deploy this DR branch to Production.
Do **not** reset/delete Production.
Do **not** mark a backup VERIFIED by editing JSON manually.
Do **not** use Supabase transaction-pooler port 6543 for backup creation.

The repository already contains and tests the backup, encryption, restore, wallet/storage reconciliation, off-site-copy verification, evidence contracts, finalization and fail-closed guards.

## Evidence already completed in repository

- read-only Production DR inventory recorded;
- Production/Preview identity guards implemented;
- Production restore target is refused;
- DR branch is non-deploying;
- automatic migration/seed work is disabled on the DR branch;
- AES-256-GCM backup envelope implemented and tamper-tested;
- PostgreSQL custom-format dump creation implemented;
- exact migration ledger, row-count and sequence evidence captured by backup creator;
- database-blob storage inventory includes per-object SHA-256 content digests;
- restore compares the recovered database to the exact source manifest;
- wallet reconciliation is automated;
- storage/document reconciliation is automated;
- stale `pending-request/` staging is classified separately from durable objects;
- off-site copy verifier checks byte size, SHA-256 and encrypted authentication;
- VERIFIED manifests require structured restore, off-site, application and tenant-isolation evidence;
- reset planner accepts only a fresh VERIFIED backup (<=24h);
- public-repository safety gate rejects tracked backups, environment files and private DR evidence;
- full synthetic PostgreSQL 17 backup -> encrypt -> restore -> reconcile -> finalize drill runs in CI.

## External task 1 — resolve the exact current Production release SHA

Resolve the currently serving Production deployment for `visa.essafariavoyages.com` in Vercel and record its exact Git commit SHA.

This value becomes `DR_RELEASE_SHA`.

Do not guess it from `main`, the DR branch, a Preview deployment or a local checkout.

Record only the SHA in the recovery evidence. Do not copy Vercel tokens or environment secrets into reports.

## External task 2 — create the real encrypted Production backup

Run from a trusted operator machine with a compatible PostgreSQL client.

Required inputs:

- exact `DR_RELEASE_SHA` from task 1;
- a Production PostgreSQL **direct or session-pooler** connection, not port 6543;
- a newly generated 32-byte random backup key encoded as base64;
- an absolute private output directory outside the repository.

Environment:

```text
DR_BACKUP_ENVIRONMENT=PRODUCTION
DR_STORAGE_MODE=DATABASE_BLOBS
DR_RELEASE_SHA=<exact Production deployment SHA>
DATABASE_SCHEMA=visa_os
MIGRATION_DATABASE_URL=<approved direct/session Production PostgreSQL URI>
DR_BACKUP_KEY_BASE64=<32 random bytes, base64>
```

Run:

```text
npm run dr:backup -- --output-dir <absolute-private-directory>
```

Expected result: `status: CREATED`.

Store the encryption key separately from the archive. Do not place it in GitHub, Vercel, the manifest filename, chat, ticket text or the same uncontrolled storage location as the archive.

## External task 3 — create and verify an independent off-site copy

Copy the encrypted `.dump.enc` artifact to an organization-controlled destination that does not depend entirely on the same Supabase project/account.

Then retrieve/mount that independent copy on the trusted operator machine and run:

```text
DR_BACKUP_KEY_BASE64=<recovery key>
npm run dr:offsite-verify -- \
  --manifest <private CREATED manifest> \
  --copy <retrieved independent encrypted copy> \
  --location-ref <opaque internal storage location ID> \
  --evidence-output <absolute private offsite evidence JSON>
```

Expected result: `status: PASS`.

The verifier must confirm byte identity, SHA-256 identity and AES-256-GCM authentication.

## External task 4 — restore the real archive into a fresh disposable target

Create a **fresh** local PostgreSQL database or a disposable non-Production Supabase project.

Required:

```text
DR_ENVIRONMENT=RESTORE_TEST
DATABASE_SCHEMA=visa_os
DATABASE_URL=<fresh disposable database>
DR_BACKUP_KEY_BASE64=<recovery key>
```

For remote disposable Supabase only:

```text
DR_ALLOW_REMOTE_DISPOSABLE=true
DR_DISPOSABLE_PROJECT_REF=<non-Production project ref>
```

Run:

```text
npm run dr:restore -- \
  --manifest <private CREATED manifest> \
  --evidence-output <absolute private restore evidence JSON>
```

Expected result: `RESTORED_AND_DATABASE_VERIFIED`.

The command already verifies:

- encrypted artifact size/SHA/authentication;
- fresh target schema;
- exact source migration ledger;
- critical table row counts;
- sequence inventory;
- storage object count/bytes/content digest;
- wallet arithmetic and ledger continuity;
- current wallet balance against ledger tail;
- duplicate application-charge protection;
- top-up linkage;
- final-decision document references;
- durable storage references and object integrity.

If `pg_restore` begins and any later step fails, discard the whole disposable target. Do not repair/reuse a partial target.

## External task 5 — run application recovery validation on the restored environment

Run the application release identified by the manifest's `source.releaseSha` against the disposable restored database, or prove an explicitly reviewed compatible recovery build. Do not silently test the restore with an unrelated newer release.

Create `dr-application-evidence.example.json` as a private working copy outside the repository and set values only from observed tests.

Every required check must pass:

- health endpoint reachable and healthy;
- authenticated Staff session/login works;
- authenticated Agency session/login works;
- Staff can read a critical operational dossier;
- Agency can read its own dossier;
- Agency can download its own private document;
- Agency can read its own wallet.

The evidence `releaseSha` must exactly match the backup manifest release SHA.
The evidence `restoreEvidenceSha256` must be the SHA-256 of the restore-evidence JSON.

Do not include passwords, tokens, passport data or document contents in the evidence file.

## External task 6 — run tenant-isolation validation on the restored environment

Use at least two different restored agency tenants.

Create `dr-tenant-evidence.example.json` as a private working copy outside the repository.

Every required check must pass:

- foreign application access denied;
- foreign document access denied;
- foreign applicant data inaccessible through the foreign dossier chain;
- foreign wallet data not visible;
- forged/cross-tenant upload path denied.

The evidence must use the same backup ID, release SHA and restore-evidence SHA as the application evidence.

If any cross-tenant access succeeds, stop. The backup must remain CREATED, not VERIFIED.

## External task 7 — finalize the backup evidence

Only after tasks 1-6 pass:

```text
npm run dr:finalize -- \
  --manifest <private CREATED manifest> \
  --restore-evidence <private restore evidence JSON> \
  --offsite-evidence <private off-site evidence JSON> \
  --application-evidence <private application evidence JSON> \
  --tenant-evidence <private tenant-isolation evidence JSON> \
  --output <absolute private VERIFIED manifest path> \
  --attest-external-evidence-reviewed
```

Then independently check:

```text
npm run dr:manifest -- --manifest <private VERIFIED manifest> --source production
```

Expected exit: 0 and `status: VERIFIED`.

Do not hand-edit a CREATED manifest into VERIFIED.

## External task 8 — only if a go-live reset is later authorized

The repository reset command remains read-only.

Use the fresh VERIFIED manifest in the reset planner and review every blocker. A real Production reset still requires explicit Owner authorization and a separately authorized executor.

No Production reset is authorized by this handoff.

## What Codex must return

Return only:

1. exact Production release SHA used;
2. backup ID and CREATED result;
3. off-site verifier PASS and evidence hash/ref;
4. isolated restore PASS and restore evidence SHA;
5. application evidence PASS;
6. tenant-isolation evidence PASS;
7. final manifest VERIFIED result;
8. any blocker, if one exists.

Never return or paste:

- database URI;
- PostgreSQL password;
- backup encryption key;
- session token;
- private document bytes;
- applicant/passport data.

If any mandatory check fails, leave the status as CREATED/FAIL and report the exact failing gate. Do not weaken the verifier.
