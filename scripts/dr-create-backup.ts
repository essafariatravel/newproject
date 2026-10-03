/**
 * Create an encrypted, self-describing PostgreSQL backup generation.
 *
 * This is deliberately a CREATED backup only. It cannot mark itself VERIFIED:
 * off-site copy, isolated restore, wallet/storage reconciliation and application
 * tenant-isolation evidence must happen afterwards.
 *
 * Required environment:
 *   DR_BACKUP_ENVIRONMENT=PRODUCTION
 *   DR_STORAGE_MODE=DATABASE_BLOBS
 *   DR_RELEASE_SHA=<exact source git SHA>
 *   DR_BACKUP_KEY_BASE64=<32 random bytes, base64>
 *   DATABASE_SCHEMA=visa_os
 *   MIGRATION_DATABASE_URL or DATABASE_URL=<approved Production project>
 *
 * Usage:
 *   npm run dr:backup -- --output-dir /absolute/private/backup/directory
 */
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Pool } from "pg";
import { databasePoolConfig } from "../src/lib/database-config";
import { qualifiedTable } from "../src/lib/database-schema";
import {
  DR_CRITICAL_TABLES,
  PRODUCTION_PROJECT_REF,
  PRODUCTION_SCHEMA,
  assessBackupManifest,
  type BackupManifest,
} from "./lib/dr-safety";
import {
  assessProductionBackupSource,
  backupKeyFromEnvironment,
  encryptFileAes256Gcm,
  pgEnvironmentFromUrl,
  sha256File,
  storageInventorySha256,
  verifyEncryptedFileAes256Gcm,
} from "./lib/dr-backup";

function parseArgs(args: string[]) {
  let outputDir: string | undefined;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--output-dir") {
      outputDir = args[++index];
      if (!outputDir) throw new Error("--output-dir requires a path");
      continue;
    }
    throw new Error("Unknown option. Use --output-dir ABSOLUTE_PRIVATE_PATH.");
  }
  if (!outputDir || !path.isAbsolute(outputDir)) throw new Error("--output-dir must be an absolute path.");
  const cwd = path.resolve(process.cwd()) + path.sep;
  const resolved = path.resolve(outputDir) + path.sep;
  if (resolved.startsWith(cwd)) throw new Error("Backup output must be outside the repository working tree.");
  return { outputDir: path.resolve(outputDir) };
}

function run(binary: string, args: string[], env: NodeJS.ProcessEnv, captureStdout = false): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      env,
      stdio: ["ignore", captureStdout ? "pipe" : "ignore", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr?.on("data", (chunk) => {
      if (stderr.length < 8000) stderr += String(chunk);
    });
    child.once("error", () => reject(new Error(`${binary} could not be started. Install a compatible PostgreSQL client.`)));
    child.once("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${binary} failed (exit ${code ?? "unknown"}). ${stderr ? "Review local operator logs; connection details are intentionally not echoed." : ""}`));
    });
  });
}

function pgMajor(versionOutput: string): number | null {
  const match = versionOutput.match(/(\d+)(?:\.\d+)?/);
  return match ? Number(match[1]) : null;
}

function compactUtc(now = new Date()): string {
  return now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

async function main() {
  const { outputDir } = parseArgs(process.argv.slice(2));
  const source = assessProductionBackupSource(process.env);
  if (!source.safe || !source.databaseUrl) {
    console.error(JSON.stringify({ status: "REFUSED", findings: source.findings }, null, 2));
    process.exitCode = 2;
    return;
  }
  const key = backupKeyFromEnvironment(process.env.DR_BACKUP_KEY_BASE64);
  await mkdir(outputDir, { recursive: true, mode: 0o700 });

  const pgEnv = pgEnvironmentFromUrl(source.databaseUrl);
  const dumpVersion = await run("pg_dump", ["--version"], pgEnv, true);
  await run("pg_restore", ["--version"], pgEnv, true);
  const dumpMajor = pgMajor(dumpVersion);
  if (!dumpMajor) throw new Error("Could not determine pg_dump version.");

  const pool = new Pool(databasePoolConfig(process.env, true));
  const client = await pool.connect();
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "essafaria-dr-"));
  const rawDump = path.join(tempDir, "database.dump");
  const timestamp = compactUtc();
  const backupId = `ESSAFARIA-PROD-${timestamp}-${process.env.DR_RELEASE_SHA!.slice(0, 12).toLowerCase()}`;
  const encryptedName = `${backupId}.dump.enc`;
  const encryptedPath = path.join(outputDir, encryptedName);
  const manifestPath = path.join(outputDir, `${backupId}.manifest.json`);

  try {
    await client.query("begin isolation level repeatable read read only");
    await client.query("set local statement_timeout = '2min'");

    const server = await client.query<{ version: number }>(
      "select current_setting('server_version_num')::int as version",
    );
    const serverMajor = Math.floor(Number(server.rows[0]!.version) / 10000);
    if (dumpMajor < serverMajor) {
      throw new Error(`pg_dump major version ${dumpMajor} is older than PostgreSQL server major ${serverMajor}.`);
    }

    const tableRows = await client.query<{ table_name: string }>(
      `select table_name from information_schema.tables
        where table_schema=$1 and table_type='BASE TABLE'
        order by table_name`,
      [PRODUCTION_SCHEMA],
    );
    const tables = new Set(tableRows.rows.map((row) => row.table_name));
    const missing = DR_CRITICAL_TABLES.filter((table) => !tables.has(table));
    if (missing.length) throw new Error(`Critical application tables are missing: ${missing.join(", ")}.`);
    if (!tables.has("document_blobs")) {
      throw new Error("DR_STORAGE_MODE=DATABASE_BLOBS requires document_blobs in the source schema.");
    }

    const rowCounts: Record<string, number> = {};
    for (const table of DR_CRITICAL_TABLES) {
      const rows = await client.query<{ count: number }>(
        `select count(*)::int as count from ${qualifiedTable(table, PRODUCTION_SCHEMA)}`,
      );
      rowCounts[table] = Number(rows.rows[0]!.count);
    }

    const migrationRows = await client.query<{ name: string }>(
      `select name from ${qualifiedTable("schema_migrations", PRODUCTION_SCHEMA)}
        order by applied_at asc, name asc`,
    );
    const migrationLedger = migrationRows.rows.map((row) => row.name);
    if (!migrationLedger.length) throw new Error("Migration ledger is empty.");

    const sequenceRows = await client.query<{ sequence_name: string }>(
      "select sequence_name from information_schema.sequences where sequence_schema=$1 order by sequence_name",
      [PRODUCTION_SCHEMA],
    );
    const sequences = sequenceRows.rows.map((row) => row.sequence_name);
    if ((rowCounts.wallet_transactions ?? 0) > 0 && !sequences.includes("wallet_reference_seq")) {
      throw new Error("wallet_reference_seq is missing from the source schema.");
    }

    const objectRows = await client.query<{ key: string; size_bytes: number }>(
      `select key, size_bytes from ${qualifiedTable("document_blobs", PRODUCTION_SCHEMA)} order by key`,
    );
    const objectInventory = objectRows.rows.map((row) => ({ key: row.key, sizeBytes: Number(row.size_bytes) }));
    const objectCount = objectInventory.length;
    const totalBytes = objectInventory.reduce((total, row) => total + row.sizeBytes, 0);
    const objectInventorySha = storageInventorySha256(objectInventory);

    const snapshotRows = await client.query<{ snapshot: string }>("select pg_export_snapshot() as snapshot");
    const snapshot = snapshotRows.rows[0]?.snapshot;
    if (!snapshot) throw new Error("Could not export a consistent PostgreSQL snapshot.");

    await run("pg_dump", [
      "--format=custom",
      "--no-owner",
      "--no-acl",
      `--schema=${PRODUCTION_SCHEMA}`,
      `--snapshot=${snapshot}`,
      `--file=${rawDump}`,
    ], pgEnv);

    await client.query("commit");

    await run("pg_restore", ["--list", rawDump], pgEnv, true);

    await encryptFileAes256Gcm(rawDump, encryptedPath, key);
    await verifyEncryptedFileAes256Gcm(encryptedPath, key);
    const encryptedStats = await stat(encryptedPath);
    const encryptedSha = await sha256File(encryptedPath);

    const manifest: BackupManifest = {
      version: 1,
      backupId,
      createdAt: new Date().toISOString(),
      source: {
        environment: "PRODUCTION",
        projectRef: PRODUCTION_PROJECT_REF,
        schema: PRODUCTION_SCHEMA,
        releaseSha: process.env.DR_RELEASE_SHA!.toLowerCase(),
        migrationLedger,
      },
      database: {
        artifact: encryptedName,
        bytes: encryptedStats.size,
        sha256: encryptedSha,
        encrypted: true,
        rowCounts,
        sequences,
      },
      storage: {
        mode: "DATABASE_BLOBS",
        objectCount,
        totalBytes,
        manifestSha256: objectInventorySha,
        encrypted: true,
      },
      verification: {
        checksumVerified: true,
        encryptionVerified: true,
        backupParsed: true,
        expectedSchemaPresent: true,
        criticalTablesPresent: true,
        rowCountsCaptured: true,
        sequencesCaptured: true,
        storageInventoryCaptured: true,
        sourceIdentityVerified: true,
        offsiteCopyVerified: false,
        verifiedAt: null,
        restoreTestedAt: null,
        restoreEnvironment: null,
        restoredApplicationChecksPassed: false,
        walletReconciliationPassed: false,
        storageReconciliationPassed: false,
        tenantIsolationPassed: false,
        restoreEvidenceSha256: null,
        offsiteEvidenceRef: null,
        applicationEvidenceRef: null,
        tenantIsolationEvidenceRef: null,
      },
    };

    const assessment = assessBackupManifest(manifest, {
      environment: "PRODUCTION",
      projectRef: PRODUCTION_PROJECT_REF,
      schema: PRODUCTION_SCHEMA,
    });
    if (assessment.status !== "CREATED") {
      throw new Error(`New backup manifest failed its own safety contract: ${assessment.findings.join("; ")}`);
    }

    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });

    console.log(JSON.stringify({
      status: "CREATED",
      backupId,
      databaseArtifact: encryptedPath,
      manifest: manifestPath,
      encryptedBytes: encryptedStats.size,
      databaseSha256: encryptedSha,
      migrationCount: migrationLedger.length,
      storageObjects: objectCount,
      storageBytes: totalBytes,
      nextRequiredEvidence: [
        "independent/off-site copy verification",
        "isolated restore",
        "wallet reconciliation",
        "storage reconciliation",
        "application and tenant-isolation checks",
      ],
    }, null, 2));
  } catch (error) {
    await client.query("rollback").catch(() => {});
    await rm(encryptedPath, { force: true }).catch(() => {});
    await rm(manifestPath, { force: true }).catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
    await rm(tempDir, { recursive: true, force: true });
    key.fill(0);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Backup creation failed safely.");
  process.exitCode = 1;
});
