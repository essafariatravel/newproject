/**
 * Read-only verification for an ESSAFARIA restore target.
 *
 * This script refuses Production and any ambiguous target before opening a
 * database connection. It does not restore data; it verifies a restore that was
 * already loaded into a disposable/local recovery environment.
 *
 * Local example:
 *   DR_ENVIRONMENT=RESTORE_TEST \
 *   DATABASE_SCHEMA=visa_os_restore_test \
 *   DATABASE_URL=postgresql://...localhost... \
 *   npm run dr:restore-verify
 *
 * External-object storage:
 *   ... npm run dr:restore-verify -- --storage-manifest /secure/path/storage.json
 */
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { databasePoolConfig } from "../src/lib/database-config";
import { qualifiedTable } from "../src/lib/database-schema";
import {
  DR_CRITICAL_TABLES,
  PRODUCTION_PROJECT_REF,
  PRODUCTION_SCHEMA,
  assessBackupManifest,
  assessRestoreTarget,
  reconcileStorageSnapshot,
  reconcileWalletSnapshot,
  type StorageObjectSnapshot,
  type StorageReferenceSnapshot,
  type TopupSnapshot,
  type WalletAgencySnapshot,
  type WalletLedgerSnapshot,
  type BackupManifest,
} from "./lib/dr-safety";
import { storageInventorySha256 } from "./lib/dr-backup";

function parseArgs(args: string[]) {
  let storageManifest: string | undefined;
  let expectedManifest: string | undefined;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--storage-manifest") {
      storageManifest = args[++index];
      if (!storageManifest) throw new Error("--storage-manifest requires a file path");
      continue;
    }
    if (args[index] === "--expected-manifest") {
      expectedManifest = args[++index];
      if (!expectedManifest) throw new Error("--expected-manifest requires a file path");
      continue;
    }
    throw new Error("Unknown option. Use [--storage-manifest PATH] [--expected-manifest PATH].");
  }
  return { storageManifest, expectedManifest };
}

function asExternalObjects(value: unknown): StorageObjectSnapshot[] {
  const root =
    Array.isArray(value)
      ? value
      : value && typeof value === "object" && Array.isArray((value as { objects?: unknown }).objects)
        ? (value as { objects: unknown[] }).objects
        : null;
  if (!root) throw new Error("Storage manifest must be an array or an object with an objects array.");
  return root.map((item, index) => {
    if (!item || typeof item !== "object") throw new Error(`Storage manifest item ${index} is invalid.`);
    const row = item as Record<string, unknown>;
    if (typeof row.key !== "string" || !row.key) throw new Error(`Storage manifest item ${index} has no key.`);
    if (typeof row.sizeBytes !== "number" || !Number.isSafeInteger(row.sizeBytes) || row.sizeBytes < 0) {
      throw new Error(`Storage manifest item ${index} has invalid sizeBytes.`);
    }
    if (row.sha256 !== undefined && row.sha256 !== null &&
        (typeof row.sha256 !== "string" || !/^[0-9a-f]{64}$/i.test(row.sha256))) {
      throw new Error(`Storage manifest item ${index} has invalid sha256.`);
    }
    return { key: row.key, sizeBytes: row.sizeBytes, sha256: typeof row.sha256 === "string" ? row.sha256.toLowerCase() : null };
  });
}

async function loadStorageManifest(path: string): Promise<StorageObjectSnapshot[]> {
  try {
    return asExternalObjects(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Storage manifest")) throw error;
    throw new Error("External storage manifest could not be read as JSON.");
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const target = assessRestoreTarget(process.env);
  if (!target.safe || !target.schema) {
    console.error(JSON.stringify({ status: "REFUSED", findings: target.findings }, null, 2));
    process.exitCode = 2;
    return;
  }

  const schema = target.schema;
  let expected: BackupManifest | null = null;
  if (args.expectedManifest) {
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(args.expectedManifest, "utf8"));
    } catch {
      throw new Error("Expected backup manifest could not be read as JSON.");
    }
    const assessment = assessBackupManifest(raw, {
      environment: "PRODUCTION",
      projectRef: PRODUCTION_PROJECT_REF,
      schema: PRODUCTION_SCHEMA,
    });
    if (!assessment.manifest || assessment.status === "INVALID") {
      throw new Error(`Expected backup manifest is INVALID: ${assessment.findings.join("; ")}`);
    }
    expected = assessment.manifest;
    if (expected.source.schema !== schema) {
      throw new Error("Restore target schema does not match the expected backup manifest schema.");
    }
  }
  const pool = new Pool(databasePoolConfig(process.env));
  const client = await pool.connect();
  const findings: string[] = [];
  let tables = new Set<string>();
  let ledger: string[] = [];
  let sequences: string[] = [];
  const rowCounts: Record<string, number> = {};
  let agencies: WalletAgencySnapshot[] = [];
  let transactions: WalletLedgerSnapshot[] = [];
  let topups: TopupSnapshot[] = [];
  let storageReferences: StorageReferenceSnapshot[] = [];
  let storageObjects: StorageObjectSnapshot[] = [];
  let terminalDecisionRows = 0;
  let ephemeralStaging = { objects: 0, bytes: 0, staleOverOneHour: 0 };

  try {
    await client.query("begin read only");
    await client.query("set local statement_timeout = '30s'");

    const tableRows = await client.query<{ table_name: string }>(
      `select table_name from information_schema.tables
        where table_schema = $1 and table_type = 'BASE TABLE'
        order by table_name`,
      [schema],
    );
    tables = new Set(tableRows.rows.map((row) => row.table_name));
    for (const name of DR_CRITICAL_TABLES) {
      if (!tables.has(name)) {
        findings.push(`CRITICAL_TABLE_MISSING: ${name}`);
        continue;
      }
      const count = await client.query<{ total: number }>(
        `select count(*)::int as total from ${qualifiedTable(name, schema)}`,
      );
      rowCounts[name] = Number(count.rows[0]?.total ?? 0);
    }

    if (tables.has("schema_migrations")) {
      const migrationRows = await client.query<{ name: string }>(
        `select name from ${qualifiedTable("schema_migrations", schema)} order by applied_at asc, name asc`,
      );
      ledger = migrationRows.rows.map((row) => row.name);
      if (!ledger.length) findings.push("MIGRATION_LEDGER_EMPTY");
    }

    const sequenceRows = await client.query<{ sequence_name: string }>(
      `select sequence_name from information_schema.sequences where sequence_schema=$1 order by sequence_name`,
      [schema],
    );
    sequences = sequenceRows.rows.map((row) => row.sequence_name);
    if (tables.has("wallet_transactions") && !sequences.includes("wallet_reference_seq")) {
      findings.push("WALLET_REFERENCE_SEQUENCE_MISSING");
    }

    if (tables.has("agencies")) {
      const rows = await client.query<{ id: string; balance: string }>(
        `select id::text, balance::text from ${qualifiedTable("agencies", schema)} order by id`,
      );
      agencies = rows.rows;
    }

    if (tables.has("wallet_transactions")) {
      const rows = await client.query<{
        id: string;
        reference: string;
        agency_id: string;
        application_id: string | null;
        type: string;
        amount: string;
        balance_before: string;
        balance_after: string;
        created_at: Date;
      }>(
        `select id::text, reference, agency_id::text, application_id::text, type,
                amount::text, balance_before::text, balance_after::text, created_at
           from ${qualifiedTable("wallet_transactions", schema)}
          order by created_at asc, reference asc`,
      );
      transactions = rows.rows.map((row) => ({
        id: row.id,
        reference: row.reference,
        agencyId: row.agency_id,
        applicationId: row.application_id,
        type: row.type,
        amount: row.amount,
        balanceBefore: row.balance_before,
        balanceAfter: row.balance_after,
        createdAt: row.created_at,
      }));
    }

    if (tables.has("wallet_topup_requests")) {
      const rows = await client.query<{
        id: string;
        reference: string;
        agency_id: string;
        status: string;
        wallet_transaction_id: string | null;
      }>(
        `select id::text, reference, agency_id::text, status, wallet_transaction_id::text
           from ${qualifiedTable("wallet_topup_requests", schema)}
          order by created_at asc, id asc`,
      );
      topups = rows.rows.map((row) => ({
        id: row.id,
        reference: row.reference,
        agencyId: row.agency_id,
        status: row.status,
        walletTransactionId: row.wallet_transaction_id,
      }));
    }

    const walletResult = reconcileWalletSnapshot(agencies, transactions, topups);
    findings.push(...walletResult.findings.map((finding) => `WALLET: ${finding}`));

    const columns = await client.query<{ table_name: string; column_name: string }>(
      `select table_name, column_name from information_schema.columns where table_schema=$1`,
      [schema],
    );
    const hasColumn = (table: string, column: string) =>
      columns.rows.some((row) => row.table_name === table && row.column_name === column);

    if (tables.has("documents") && tables.has("document_types")) {
      const rows = await client.query<{
        id: string;
        key: string;
        size_bytes: number;
        type_code: string;
      }>(
        `select d.id::text, d.storage_key as key, d.size_bytes, t.code as type_code
           from ${qualifiedTable("documents", schema)} d
           join ${qualifiedTable("document_types", schema)} t on t.id=d.document_type_id
          where d.storage_key is not null and length(d.storage_key)>0
          order by d.id`,
      );
      storageReferences.push(...rows.rows.map((row) => ({
        id: row.id,
        kind: ["DECISION_VISA_APPROVAL", "DECISION_REFUSAL_LETTER"].includes(row.type_code)
          ? "OFFICIAL_DECISION" as const
          : "DOSSIER_DOCUMENT" as const,
        key: row.key,
        expectedSizeBytes: Number(row.size_bytes),
      })));

      if (tables.has("applications") && tables.has("statuses")) {
        const terminal = await client.query<{ id: string; status_code: string; official_exists: boolean }>(
          `select a.id::text, s.code as status_code,
                  exists (
                    select 1
                      from ${qualifiedTable("documents", schema)} d
                      join ${qualifiedTable("document_types", schema)} dt on dt.id=d.document_type_id
                     where d.application_id=a.id
                       and d.status='ACCEPTED'
                       and dt.code = case s.code
                         when 'APPROVED' then 'DECISION_VISA_APPROVAL'
                         when 'REJECTED' then 'DECISION_REFUSAL_LETTER'
                       end
                       and d.storage_key is not null and length(d.storage_key)>0
                  ) as official_exists
             from ${qualifiedTable("applications", schema)} a
             join ${qualifiedTable("statuses", schema)} s on s.id=a.status_id
            where s.code in ('APPROVED','REJECTED')
            order by a.id`,
        );
        terminalDecisionRows = terminal.rows.length;
        for (const row of terminal.rows) {
          if (!row.official_exists) findings.push(`FINAL_DECISION_METADATA_MISSING: application ${row.id} status ${row.status_code}`);
        }
      }
    }

    if (tables.has("agency_registration_documents")) {
      const rows = await client.query<{ id: string; key: string; size_bytes: number }>(
        `select id::text, storage_key as key, size_bytes
           from ${qualifiedTable("agency_registration_documents", schema)}
          where storage_key is not null and length(storage_key)>0
          order by id`,
      );
      storageReferences.push(...rows.rows.map((row) => ({
        id: row.id,
        kind: "REGISTRATION_DOCUMENT" as const,
        key: row.key,
        expectedSizeBytes: Number(row.size_bytes),
      })));
    }

    if (tables.has("wallet_topup_requests") && hasColumn("wallet_topup_requests", "proof_storage_key")) {
      const rows = await client.query<{ id: string; key: string; proof_size_bytes: number | null }>(
        `select id::text, proof_storage_key as key, proof_size_bytes
           from ${qualifiedTable("wallet_topup_requests", schema)}
          where proof_storage_key is not null and length(proof_storage_key)>0
          order by id`,
      );
      storageReferences.push(...rows.rows.map((row) => ({
        id: row.id,
        kind: "TOPUP_RECEIPT" as const,
        key: row.key,
        expectedSizeBytes: row.proof_size_bytes === null ? null : Number(row.proof_size_bytes),
      })));
    }

    if (tables.has("agencies") && hasColumn("agencies", "logo_key")) {
      const rows = await client.query<{ id: string; key: string }>(
        `select id::text, logo_key as key
           from ${qualifiedTable("agencies", schema)}
          where logo_key is not null and length(logo_key)>0
          order by id`,
      );
      storageReferences.push(...rows.rows.map((row) => ({
        id: row.id,
        kind: "AGENCY_LOGO" as const,
        key: row.key,
        expectedSizeBytes: null,
      })));
    }

    if (tables.has("site_settings")) {
      const rows = await client.query<{ key: string | null }>(
        `select value #>> '{}' as key
           from ${qualifiedTable("site_settings", schema)}
          where key='brand.logoKey'`,
      );
      const brandLogoKey = rows.rows[0]?.key?.trim();
      if (brandLogoKey) {
        storageReferences.push({
          id: "brand.logoKey",
          kind: "BRAND_LOGO",
          key: brandLogoKey,
          expectedSizeBytes: null,
        });
      }
    }

    if ((process.env.STORAGE_PROVIDER ?? "db") === "db") {
      if (!tables.has("document_blobs")) {
        findings.push("DOCUMENT_BLOBS_TABLE_MISSING");
      } else {
        const rows = await client.query<{ key: string; size_bytes: number; sha256: string }>(
          `select key, size_bytes, encode(digest(data,'sha256'),'hex') as sha256
             from ${qualifiedTable("document_blobs", schema)}
            order by key`,
        );
        storageObjects = rows.rows.map((row) => ({
          key: row.key,
          sizeBytes: Number(row.size_bytes),
          sha256: row.sha256.toLowerCase(),
        }));
        const staging = await client.query<{ objects: number; bytes: string; stale: number }>(
          `select count(*)::int as objects,
                  coalesce(sum(size_bytes),0)::text as bytes,
                  count(*) filter (where created_at < now() - interval '1 hour')::int as stale
             from ${qualifiedTable("document_blobs", schema)}
            where key like 'pending-request/%'`,
        );
        ephemeralStaging = {
          objects: Number(staging.rows[0]?.objects ?? 0),
          bytes: Number(staging.rows[0]?.bytes ?? 0),
          staleOverOneHour: Number(staging.rows[0]?.stale ?? 0),
        };
      }
    } else {
      if (!args.storageManifest) {
        findings.push("EXTERNAL_STORAGE_MANIFEST_REQUIRED");
      } else {
        storageObjects = await loadStorageManifest(args.storageManifest);
      }
    }

    const storageResult = reconcileStorageSnapshot(storageReferences, storageObjects);
    findings.push(...storageResult.findings.map((finding) => `STORAGE: ${finding}`));

    let manifestComparison = {
      enabled: Boolean(expected),
      rowCountsMatch: null as boolean | null,
      migrationLedgerMatch: null as boolean | null,
      sequenceInventoryMatch: null as boolean | null,
      storageInventoryMatch: null as boolean | null,
      passed: null as boolean | null,
    };
    if (expected) {
      const rowMismatches = DR_CRITICAL_TABLES.filter(
        (table) => rowCounts[table] !== expected!.database.rowCounts[table],
      );
      if (rowMismatches.length) {
        findings.push(`MANIFEST_ROW_COUNT_MISMATCH: ${rowMismatches.join(",")}`);
      }

      const migrationLedgerMatch =
        ledger.length === expected.source.migrationLedger.length &&
        ledger.every((name, index) => name === expected!.source.migrationLedger[index]);
      if (!migrationLedgerMatch) findings.push("MANIFEST_MIGRATION_LEDGER_MISMATCH");

      const observedSequences = [...sequences].sort();
      const expectedSequences = [...expected.database.sequences].sort();
      const sequenceInventoryMatch =
        observedSequences.length === expectedSequences.length &&
        observedSequences.every((name, index) => name === expectedSequences[index]);
      if (!sequenceInventoryMatch) findings.push("MANIFEST_SEQUENCE_INVENTORY_MISMATCH");

      const provider = process.env.STORAGE_PROVIDER ?? "db";
      const expectedProvider = expected.storage.mode === "DATABASE_BLOBS" ? "db" : "supabase";
      if (provider !== expectedProvider) {
        findings.push(`MANIFEST_STORAGE_MODE_MISMATCH: expected ${expected.storage.mode}`);
      }
      const observedStorageCount = storageObjects.length;
      const observedStorageBytes = storageObjects.reduce((total, row) => total + row.sizeBytes, 0);
      const observedStorageSha = storageInventorySha256(storageObjects);
      const storageInventoryMatch =
        observedStorageCount === expected.storage.objectCount &&
        observedStorageBytes === expected.storage.totalBytes &&
        observedStorageSha === expected.storage.manifestSha256;
      if (!storageInventoryMatch) findings.push("MANIFEST_STORAGE_INVENTORY_MISMATCH");

      manifestComparison = {
        enabled: true,
        rowCountsMatch: rowMismatches.length === 0,
        migrationLedgerMatch,
        sequenceInventoryMatch,
        storageInventoryMatch,
        passed:
          rowMismatches.length === 0 &&
          migrationLedgerMatch &&
          sequenceInventoryMatch &&
          storageInventoryMatch &&
          provider === expectedProvider,
      };
    }

    await client.query("rollback");

    const result = {
      status: findings.length ? "FAIL" : "PASS",
      target: { mode: target.mode, schema },
      migrationLedger: {
        count: ledger.length,
        first: ledger[0] ?? null,
        last: ledger.at(-1) ?? null,
      },
      schema: {
        criticalTablesExpected: DR_CRITICAL_TABLES.length,
        criticalTablesPresent: DR_CRITICAL_TABLES.filter((name) => tables.has(name)).length,
        rowCounts,
        sequenceCount: sequences.length,
      },
      manifestComparison,
      wallet: {
        agenciesChecked: walletResult.agenciesChecked,
        transactionsChecked: walletResult.transactionsChecked,
        topupsChecked: topups.length,
        passed: walletResult.ok,
      },
      storage: {
        provider: process.env.STORAGE_PROVIDER ?? "db",
        referencesChecked: storageResult.referencesChecked,
        objectsChecked: storageResult.objectsChecked,
        missingObjects: storageResult.missingObjects,
        orphanObjects: storageResult.orphanObjects,
        ephemeralObjectsIgnoredByDurableReconciliation: storageResult.ephemeralObjects,
        ephemeralBytesIgnoredByDurableReconciliation: storageResult.ephemeralBytes,
        ephemeralStaging,
        finalDecisionApplicationsChecked: terminalDecisionRows,
        passed: storageResult.ok,
      },
      findings,
    };
    console.log(JSON.stringify(result, null, 2));
    if (findings.length) process.exitCode = 2;
  } finally {
    await client.query("rollback").catch(() => {});
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  // Do not serialize pg errors: connection configuration may contain credentials.
  console.error(error instanceof Error &&
      /Unknown option|storage manifest|Storage manifest|backup manifest|Backup manifest|restore target|DATABASE|DR_/.test(error.message)
    ? error.message
    : "Restore verification could not complete. No data was changed.");
  process.exitCode = 1;
});
