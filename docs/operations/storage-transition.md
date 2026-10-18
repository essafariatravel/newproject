# Private document Storage transition — pending qualification

`src/lib/storage.ts` already supplies DB and Supabase implementations. Do not add a second provider. DB remains the default; a global provider switch does not migrate existing objects.

The local provider tests cover real HTTP round trips through a loopback substitute: immutable puts, byte identity, bounded downloads, explicit missing-key handling, denied permissions, HTTP failures, timeouts and redirect rejection. A failed delete now throws; only a verified missing object is idempotent success. This does not certify hosted bucket permissions or tenant authorization.

## Gates before hosted qualification

Identify the exact isolated project, private bucket and server secret scope. Current endpoint pinning intentionally does not authorize a new Supabase project. A new pin/bucket/env and Preview deployment need their own reviewed change. Verify `public=false`, no anonymous direct read/list/write, no broad authenticated policies, bounded MIME/size and server-only credentials. Custom ESSAFARIA sessions are not Supabase Auth JWTs; do not invent an `auth.uid()` tenant mapping. The service-role key bypasses RLS, so every application route must enforce its current DB-backed agency authorization before requesting an object.

Use synthetic files and two authorized test tenants only, in serial smoke tests after explicit hosted approval. For each agency, exercise allowed upload/read/replacement and denied access to another agency's application/document IDs; verify staff RBAC, immutable original SHA and unchanged metadata on errors. Never show object bytes, filenames, credentials or signed URLs in public reports. Do not enable direct browser bucket access to make a test pass.

## Recoverable migration protocol

1. Obtain the exact encrypted database and object recovery set; restore it on an isolated target. Inventory all storage references, including application documents, registration documents, top-up proofs and logos. Classify shared keys, absent bodies and unreferenced blobs; never infer successful coverage from counts alone.
2. Build a private encrypted manifest with opaque IDs, source/destination provider and key, MIME, length, SHA-256, source snapshot identity, phase and verified timestamp. Keep the source DB bytes and backups intact. Freeze affected writes or use a qualified per-document locking/version protocol.
3. Copy in bounded batches to a separately qualified private bucket, with immutable destination keys and no upsert. Download each destination through the intended provider, compare length, MIME and SHA-256 before recording `VERIFIED`. A conflict is acceptable only after the existing destination bytes match; otherwise stop.
4. A checkpoint is durable only after the verified manifest is committed. Restart skips only records whose source identity and destination SHA still match. Test interruption after upload/before checkpoint and after checkpoint/before reference switch. Never infer success from an HTTP acknowledgment alone.
5. Switch metadata only after every live reference is covered, with transaction locks, expected source version/hash checks and a single reviewed routing policy. There is currently no per-document provider column; therefore do not switch `STORAGE_PROVIDER` with an incomplete population. Validate every reference again after the controlled switch.
6. Rollback before source retirement restores the previous routing and metadata from the verified manifest; source bytes remain present. No source blob deletion is part of this preparation. Later retirement requires a new recovery point, full coverage and distinct authorization.

## Explicit release blockers

### Local durable recovery qualification (18 October 2026)

`src/lib/storage-operations.ts` now supplies a deliberately local-only journal protocol, using the existing `StorageProvider` interface. It is not selected by `storageProvider()` and no application route or worker calls it. `migrations/proposals/0036_storage_operations.sql` is a proposal outside automatic root migration discovery and the 0034/0035 candidate set; it does not extend any approved release range.

Disposable PostgreSQL tests exercise reserve-before-upload, verified byte/MIME/SHA identity, atomic metadata adoption and detachment, immutable object identity, restart with the same durable journal, retry after transport/audit failure, competing workers and immutable deletion receipts. Merely reserved or uncertain uploads cannot be queued for deletion: a reservation does not establish ownership of pre-existing bytes. An acknowledged delete is insufficient; a subsequent verified missing-object response is required. Bounded adapter timeouts preserve pending/uncertain state and do not claim cancellation of the external operation.

This qualification uses an in-memory trusted object adapter and the actual local PostgreSQL transaction engine. The existing provider has separate real loopback HTTP tests. Neither proves a deployed private bucket, an end-to-end application writer, or that a supplied adapter actually matches its declared origin/bucket. The journal serializes local operations globally and locks known reference tables for deletion; it is a correctness fixture, not a 500-agency throughput claim. Unknown reference columns block retirement. Staged/crashed uploads and uncertain remote actions require reconciliation and writer drainage before retirement.

Before integration, bind the actual adapter to the recorded target, retain route RBAC/tenant checks, qualify every writer and reference location, then connect upload/replace/compensation flows and recovery reconciliation. Qualify the object protocol together with the database recovery set, external J+120 purge and backup lifecycle before any hosted rollout. These remaining gates are not waived by local tests.

The current document/registration compensation paths swallow cleanup errors after failed metadata operations, and draft deletion can commit metadata before external blob deletion. An HTTP error is now visible at provider level, but those paths still need a durable, recoverable cleanup/outbox protocol before external Storage is declared qualified. Do not report orphan prevention PASS from provider tests.

Retention is dormant and qualified for the disposable DB provider only. The J+120 service verifies genuine decision evidence, holds, active cases, coverage and concurrent writers; it does not qualify an external-object purge. External purge requires a durable state machine, absence verification, retry and an immutable success receipt only after all copies are reconciled. Failed or pending physical deletion cannot be recorded as successful purge. Backup expiry and restore reconciliation must honor holds and existing receipts.

No Storage migration, bucket policy edit, hosted purge or provider switch has been performed.

Sources: [Supabase access control](https://supabase.com/docs/guides/storage/security/access-control), [private downloads](https://supabase.com/docs/guides/storage/serving/downloads), [backup limits](https://supabase.com/docs/guides/platform/backups).
