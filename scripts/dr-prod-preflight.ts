/**
 * Read-only Production backup preflight.
 *
 * This command is intentionally source-side only. It validates that the current
 * Production database can be backed up by the DR tooling without modifying it.
 * It never restores, migrates, seeds, updates, deletes or prints private rows.
 */
import { Pool } from "pg";
import { assessProductionBackupSource } from "./lib/dr-backup";
import {
  DR_CRITICAL_TABLES,
  PRODUCTION_SCHEMA,
  reconcileStorageSnapshot,
  reconcileWalletSnapshot,
  type StorageReferenceSnapshot,
  type StorageObjectSnapshot,
  type TopupSnapshot,
  type WalletAgencySnapshot,
  type WalletLedgerSnapshot,
} from "./lib/dr-safety";
import { databasePoolConfig } from "../src/lib/database-config";
import { qualifiedTable } from "../src/lib/database-schema";

async function main() {
  const source = assessProductionBackupSource(process.env);
  if (!source.safe || !source.databaseUrl) {
    console.error(JSON.stringify({ status: "REFUSED", findings: source.findings }, null, 2));
    process.exitCode = 2;
    return;
  }

  const pool = new Pool(databasePoolConfig({ ...process.env, DATABASE_URL: source.databaseUrl }, false));
  const client = await pool.connect();
  const findings: string[] = [];
  try {
    await client.query("begin read only");
    await client.query("set local statement_timeout='20s'");

    const tablesResult = await client.query<{ table_name: string }>(
      `select table_name from information_schema.tables
        where table_schema=$1 and table_type='BASE TABLE'`,
      [PRODUCTION_SCHEMA],
    );
    const tables = new Set(tablesResult.rows.map((row) => row.table_name));
    for (const table of DR_CRITICAL_TABLES) {
      if (!tables.has(table)) findings.push(`CRITICAL_TABLE_MISSING: ${table}`);
    }
    if (!tables.has("document_blobs")) findings.push("DOCUMENT_BLOBS_TABLE_MISSING");

    const migrations = tables.has("schema_migrations")
      ? await client.query<{ name: string }>(
          `select name from ${qualifiedTable("schema_migrations", PRODUCTION_SCHEMA)} order by applied_at,name`,
        )
      : { rows: [] as Array<{ name: string }> };
    if (!migrations.rows.length) findings.push("MIGRATION_LEDGER_EMPTY");

    const pgcrypto = await client.query<{ available: boolean }>(
      "select exists(select 1 from pg_extension where extname='pgcrypto') as available",
    );
    if (!pgcrypto.rows[0]?.available) findings.push("PGCRYPTO_EXTENSION_MISSING");

    if (tables.has("document_blobs")) {
      try {
        await client.query(
          `select encode(digest(data,'sha256'),'hex')
             from ${qualifiedTable("document_blobs", PRODUCTION_SCHEMA)}
            limit 1`,
        );
      } catch {
        findings.push("BLOB_SHA256_DIGEST_UNAVAILABLE");
      }
    }

    let agencies: WalletAgencySnapshot[] = [];
    let transactions: WalletLedgerSnapshot[] = [];
    let topups: TopupSnapshot[] = [];

    if (tables.has("agencies")) {
      const rows = await client.query<{ id: string; balance: string }>(
        `select id::text,balance::text from ${qualifiedTable("agencies", PRODUCTION_SCHEMA)} order by id`,
      );
      agencies = rows.rows;
    }
    if (tables.has("wallet_transactions")) {
      const rows = await client.query<{
        id: string; reference: string; agency_id: string; application_id: string | null;
        type: string; amount: string; balance_before: string; balance_after: string; created_at: Date;
      }>(
        `select id::text,reference,agency_id::text,application_id::text,type,
                amount::text,balance_before::text,balance_after::text,created_at
           from ${qualifiedTable("wallet_transactions", PRODUCTION_SCHEMA)}
          order by created_at,id`,
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
        id: string; reference: string; agency_id: string; status: string; wallet_transaction_id: string | null;
      }>(
        `select id::text,reference,agency_id::text,status,wallet_transaction_id::text
           from ${qualifiedTable("wallet_topup_requests", PRODUCTION_SCHEMA)}
          order by created_at,id`,
      );
      topups = rows.rows.map((row) => ({
        id: row.id,
        reference: row.reference,
        agencyId: row.agency_id,
        status: row.status,
        walletTransactionId: row.wallet_transaction_id,
      }));
    }
    const wallet = reconcileWalletSnapshot(agencies, transactions, topups);
    findings.push(...wallet.findings.map((finding) => `WALLET: ${finding}`));

    const columns = await client.query<{ table_name: string; column_name: string }>(
      "select table_name,column_name from information_schema.columns where table_schema=$1",
      [PRODUCTION_SCHEMA],
    );
    const hasColumn = (table: string, column: string) =>
      columns.rows.some((row) => row.table_name === table && row.column_name === column);

    const references: StorageReferenceSnapshot[] = [];
    if (tables.has("documents") && tables.has("document_types")) {
      const docs = await client.query<{ id: string; key: string; size_bytes: number; type_code: string }>(
        `select d.id::text,d.storage_key as key,d.size_bytes,dt.code as type_code
           from ${qualifiedTable("documents", PRODUCTION_SCHEMA)} d
           join ${qualifiedTable("document_types", PRODUCTION_SCHEMA)} dt on dt.id=d.document_type_id
          where d.storage_key is not null and length(d.storage_key)>0
          order by d.id`,
      );
      references.push(...docs.rows.map((row) => ({
        id: row.id,
        kind: ["DECISION_VISA_APPROVAL","DECISION_REFUSAL_LETTER"].includes(row.type_code)
          ? "OFFICIAL_DECISION" as const
          : "DOSSIER_DOCUMENT" as const,
        key: row.key,
        expectedSizeBytes: Number(row.size_bytes),
      })));
    }
    if (tables.has("agency_registration_documents")) {
      const rows = await client.query<{ id: string; key: string; size_bytes: number }>(
        `select id::text,storage_key as key,size_bytes
           from ${qualifiedTable("agency_registration_documents", PRODUCTION_SCHEMA)}
          where storage_key is not null and length(storage_key)>0`,
      );
      references.push(...rows.rows.map((row) => ({
        id: row.id,
        kind: "REGISTRATION_DOCUMENT" as const,
        key: row.key,
        expectedSizeBytes: Number(row.size_bytes),
      })));
    }
    if (tables.has("wallet_topup_requests") && hasColumn("wallet_topup_requests","proof_storage_key")) {
      const rows = await client.query<{ id: string; key: string; proof_size_bytes: number | null }>(
        `select id::text,proof_storage_key as key,proof_size_bytes
           from ${qualifiedTable("wallet_topup_requests", PRODUCTION_SCHEMA)}
          where proof_storage_key is not null and length(proof_storage_key)>0`,
      );
      references.push(...rows.rows.map((row) => ({
        id: row.id,
        kind: "TOPUP_RECEIPT" as const,
        key: row.key,
        expectedSizeBytes: row.proof_size_bytes === null ? null : Number(row.proof_size_bytes),
      })));
    }
    if (tables.has("agencies") && hasColumn("agencies","logo_key")) {
      const rows = await client.query<{ id: string; key: string }>(
        `select id::text,logo_key as key from ${qualifiedTable("agencies", PRODUCTION_SCHEMA)}
          where logo_key is not null and length(logo_key)>0`,
      );
      references.push(...rows.rows.map((row) => ({
        id: row.id,
        kind: "AGENCY_LOGO" as const,
        key: row.key,
        expectedSizeBytes: null,
      })));
    }
    if (tables.has("site_settings")) {
      const rows = await client.query<{ key: string | null }>(
        `select value #>> '{}' as key from ${qualifiedTable("site_settings", PRODUCTION_SCHEMA)}
          where key='brand.logoKey'`,
      );
      const key = rows.rows[0]?.key?.trim();
      if (key) references.push({ id: "brand.logoKey", kind: "BRAND_LOGO", key, expectedSizeBytes: null });
    }

    let objects: StorageObjectSnapshot[] = [];
    let staleStaging = 0;
    if (tables.has("document_blobs")) {
      const rows = await client.query<{ key: string; size_bytes: number; sha256: string }>(
        `select key,size_bytes,encode(digest(data,'sha256'),'hex') as sha256
           from ${qualifiedTable("document_blobs", PRODUCTION_SCHEMA)}
          order by key`,
      );
      objects = rows.rows.map((row) => ({
        key: row.key,
        sizeBytes: Number(row.size_bytes),
        sha256: row.sha256.toLowerCase(),
      }));
      const staged = await client.query<{ stale: number }>(
        `select count(*) filter(where created_at < now()-interval '1 hour')::int as stale
           from ${qualifiedTable("document_blobs", PRODUCTION_SCHEMA)}
          where key like 'pending-request/%'`,
      );
      staleStaging = Number(staged.rows[0]?.stale ?? 0);
    }
    const storage = reconcileStorageSnapshot(references, objects);
    findings.push(...storage.findings.map((finding) => `STORAGE: ${finding}`));

    let terminalDecisions = 0;
    let missingDecisionEvidence = 0;
    if (tables.has("applications") && tables.has("statuses") && tables.has("documents") && tables.has("document_types")) {
      const result = await client.query<{ total: number; missing: number }>(
        `select
           count(*)::int as total,
           count(*) filter(where not exists(
             select 1
               from ${qualifiedTable("documents", PRODUCTION_SCHEMA)} d
               join ${qualifiedTable("document_types", PRODUCTION_SCHEMA)} dt on dt.id=d.document_type_id
              where d.application_id=a.id
                and d.status='ACCEPTED'
                and dt.code=case s.code when 'APPROVED' then 'DECISION_VISA_APPROVAL'
                                          when 'REJECTED' then 'DECISION_REFUSAL_LETTER' end
                and d.storage_key is not null and length(d.storage_key)>0
           ))::int as missing
         from ${qualifiedTable("applications", PRODUCTION_SCHEMA)} a
         join ${qualifiedTable("statuses", PRODUCTION_SCHEMA)} s on s.id=a.status_id
        where s.code in ('APPROVED','REJECTED')`,
      );
      terminalDecisions = Number(result.rows[0]?.total ?? 0);
      missingDecisionEvidence = Number(result.rows[0]?.missing ?? 0);
      if (missingDecisionEvidence) findings.push(`FINAL_DECISION_EVIDENCE_MISSING: ${missingDecisionEvidence}`);
    }

    await client.query("rollback");

    const result = {
      status: findings.length ? "BLOCKED" : "READY_FOR_BACKUP",
      source: {
        projectRef: "xgetzgixalrsmuvfthpf",
        schema: PRODUCTION_SCHEMA,
        releaseSha: process.env.DR_RELEASE_SHA,
        storageMode: process.env.DR_STORAGE_MODE,
      },
      migrationLedger: {
        count: migrations.rows.length,
        first: migrations.rows[0]?.name ?? null,
        last: migrations.rows.at(-1)?.name ?? null,
      },
      wallet: {
        agenciesChecked: wallet.agenciesChecked,
        transactionsChecked: wallet.transactionsChecked,
        topupsChecked: topups.length,
        passed: wallet.ok,
      },
      storage: {
        durableReferences: references.length,
        durableObjectsChecked: storage.objectsChecked,
        missingObjects: storage.missingObjects,
        orphanObjects: storage.orphanObjects,
        ephemeralObjects: storage.ephemeralObjects,
        staleEphemeralOverOneHour: staleStaging,
        passed: storage.ok,
      },
      finalDecisions: {
        total: terminalDecisions,
        missingOfficialEvidence: missingDecisionEvidence,
      },
      pgcryptoDigestAvailable: !findings.includes("PGCRYPTO_EXTENSION_MISSING") &&
        !findings.includes("BLOB_SHA256_DIGEST_UNAVAILABLE"),
      findings,
      productionModified: false,
    };
    console.log(JSON.stringify(result, null, 2));
    if (findings.length) process.exitCode = 2;
  } finally {
    await client.query("rollback").catch(() => undefined);
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Production DR preflight failed safely.");
  process.exitCode = 1;
});
