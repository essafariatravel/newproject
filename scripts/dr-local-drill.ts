/**
 * Fully local, synthetic disaster-recovery drill.
 *
 * Purpose:
 * - exercise the real migration set;
 * - produce a real pg_dump from PostgreSQL 17;
 * - encrypt it with the production DR envelope;
 * - restore it through the real dr:restore command into a second fresh DB;
 * - run wallet/storage/schema reconciliation;
 * - bind restore evidence and exercise finalization.
 *
 * It never contacts Production and never uses real customer data or secrets.
 */
import { spawn } from "node:child_process";
import { copyFile, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Pool } from "pg";
import EmbeddedPostgres from "embedded-postgres";
import { applyMigrations } from "./lib/migrations";
import {
  DR_CRITICAL_TABLES,
  PRODUCTION_PROJECT_REF,
  PRODUCTION_SCHEMA,
  assessBackupManifest,
  type BackupManifest,
} from "./lib/dr-safety";
import {
  encryptFileAes256Gcm,
  sha256File,
  storageInventorySha256,
  verifyEncryptedFileAes256Gcm,
} from "./lib/dr-backup";
import type { RestoreEvidence } from "./lib/dr-finalization";

const PORT = 5441;
const USER = "postgres";
const PASSWORD = "postgres";
const SOURCE_DB = "essafaria_dr_source";
const TARGET_DB = "essafaria_dr_target";

function embeddedPackageSegment(): string {
  const key = `${process.platform}-${process.arch}`;
  const map: Record<string, string> = {
    "darwin-arm64": "darwin-arm64",
    "darwin-x64": "darwin-x64",
    "linux-arm": "linux-arm",
    "linux-arm64": "linux-arm64",
    "linux-ia32": "linux-ia32",
    "linux-ppc64": "linux-ppc64",
    "linux-x64": "linux-x64",
    "win32-x64": "windows-x64",
  };
  const segment = map[key];
  if (!segment) throw new Error(`Synthetic DR drill is unsupported on ${key}.`);
  return segment;
}

function pgBinary(name: string): string {
  const suffix = process.platform === "win32" ? ".exe" : "";
  return path.join(
    process.cwd(),
    "node_modules",
    "@embedded-postgres",
    embeddedPackageSegment(),
    "native",
    "bin",
    name + suffix,
  );
}

function connection(database: string): string {
  return `postgresql://${USER}:${PASSWORD}@127.0.0.1:${PORT}/${database}`;
}

function pgEnv(database: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PGHOST: "127.0.0.1",
    PGPORT: String(PORT),
    PGDATABASE: database,
    PGUSER: USER,
    PGPASSWORD: PASSWORD,
  };
}

function run(
  binary: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  options: { capture?: boolean } = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      env,
      stdio: options.capture === false ? "inherit" : ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr?.on("data", (chunk) => {
      if (stderr.length < 12000) stderr += String(chunk);
    });
    child.once("error", () => reject(new Error(`${path.basename(binary)} could not be started.`)));
    child.once("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${path.basename(binary)} failed with exit ${code ?? "unknown"}.${stderr ? " Inspect synthetic drill logs." : ""}`));
    });
  });
}

function runExpectExit(
  binary: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  expectedCode: number,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr?.on("data", (chunk) => { stderr += String(chunk); });
    child.once("error", () => reject(new Error(`${path.basename(binary)} could not be started.`)));
    child.once("close", (code) => {
      if (code === expectedCode) resolve({ stdout, stderr });
      else reject(new Error(`${path.basename(binary)} exited ${code ?? "unknown"}, expected ${expectedCode}.`));
    });
  });
}

async function criticalRowCounts(pool: Pool): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of DR_CRITICAL_TABLES) {
    const result = await pool.query<{ count: number }>(
      `select count(*)::int as count from "${PRODUCTION_SCHEMA}"."${table}"`,
    );
    counts[table] = Number(result.rows[0]!.count);
  }
  return counts;
}

async function seedRecoverySignals(pool: Pool): Promise<void> {
  const agency = await pool.query<{ id: string }>(
    `insert into "${PRODUCTION_SCHEMA}".agencies
       (legal_name,trading_name,email,city,country,balance,currency)
     values
       ('Synthetic DR Agency','Synthetic DR','drill@example.invalid','Algiers','Algeria',100,'DZD')
     returning id::text`,
  );
  const agencyId = agency.rows[0]!.id;

  await pool.query(
    `insert into "${PRODUCTION_SCHEMA}".wallet_transactions
       (agency_id,type,amount,currency,balance_before,balance_after,reason)
     values ($1,'CREDIT',100,'DZD',0,100,'Synthetic DR drill credit')`,
    [agencyId],
  );

  const durableKey = "branding/synthetic-dr-logo";
  const durableBytes = Buffer.from("synthetic-dr-logo");
  await pool.query(
    `insert into "${PRODUCTION_SCHEMA}".document_blobs (key,mime_type,size_bytes,data)
     values ($1,'application/octet-stream',$2,$3)`,
    [durableKey, durableBytes.length, durableBytes],
  );
  await pool.query(
    `insert into "${PRODUCTION_SCHEMA}".site_settings (key,value)
     values ('brand.logoKey',$1::jsonb)
     on conflict (key) do update set value=excluded.value`,
    [JSON.stringify(durableKey)],
  );

  const stagedKey = "pending-request/00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000002/00000000-0000-0000-0000-000000000003/00000000-0000-0000-0000-000000000004/0";
  const stagedBytes = Buffer.from("ephemeral");
  await pool.query(
    `insert into "${PRODUCTION_SCHEMA}".document_blobs (key,mime_type,size_bytes,data,created_at)
     values ($1,'application/octet-stream',$2,$3,now()-interval '2 hours')`,
    [stagedKey, stagedBytes.length, stagedBytes],
  );
}

async function main() {
  if (process.env.VERCEL || process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production") {
    throw new Error("Synthetic DR drill is forbidden in deployed/Production runtime.");
  }

  const root = await mkdtemp(path.join(os.tmpdir(), "essafaria-dr-local-"));
  const dataDir = path.join(root, "postgres");
  const dumpPath = path.join(root, "source.dump");
  const encryptedPath = path.join(root, "synthetic.dump.enc");
  const manifestPath = path.join(root, "synthetic.manifest.json");
  const restoreEvidencePath = path.join(root, "synthetic.restore-evidence.json");
  const offsiteCopyPath = path.join(root, "independent-copy", "synthetic-copy.dump.enc");
  const offsiteEvidencePath = path.join(root, "synthetic.offsite-evidence.json");
  const verifiedManifestPath = path.join(root, "synthetic.verified.manifest.json");
  const tamperedManifestPath = path.join(root, "synthetic.tampered.manifest.json");
  const key = Buffer.alloc(32, 73);
  const keyBase64 = key.toString("base64");
  let pg: InstanceType<typeof EmbeddedPostgres> | null = null;

  try {
    pg = new EmbeddedPostgres({
      databaseDir: dataDir,
      user: USER,
      password: PASSWORD,
      port: PORT,
      persistent: false,
    });
    await pg.initialise();
    await pg.start();
    await pg.createDatabase(SOURCE_DB);
    await pg.createDatabase(TARGET_DB);

    const sourcePool = new Pool({ connectionString: connection(SOURCE_DB) });
    try {
      await applyMigrations(sourcePool, path.join(process.cwd(), "migrations"), PRODUCTION_SCHEMA);
      await seedRecoverySignals(sourcePool);

      const migrationResult = await sourcePool.query<{ name: string }>(
        `select name from "${PRODUCTION_SCHEMA}".schema_migrations order by applied_at,name`,
      );
      const sequenceResult = await sourcePool.query<{ sequence_name: string }>(
        "select sequence_name from information_schema.sequences where sequence_schema=$1 order by sequence_name",
        [PRODUCTION_SCHEMA],
      );
      const objectResult = await sourcePool.query<{ key: string; size_bytes: number }>(
        `select key,size_bytes from "${PRODUCTION_SCHEMA}".document_blobs order by key`,
      );

      await run(pgBinary("pg_dump"), [
        "--format=custom",
        "--no-owner",
        "--no-acl",
        `--schema=${PRODUCTION_SCHEMA}`,
        `--file=${dumpPath}`,
        SOURCE_DB,
      ], pgEnv(SOURCE_DB));

      await run(pgBinary("pg_restore"), ["--list", dumpPath], pgEnv(SOURCE_DB));
      await encryptFileAes256Gcm(dumpPath, encryptedPath, key);
      await verifyEncryptedFileAes256Gcm(encryptedPath, key);

      const encryptedStats = await stat(encryptedPath);
      const objects = objectResult.rows.map((row) => ({ key: row.key, sizeBytes: Number(row.size_bytes) }));
      const manifest: BackupManifest = {
        version: 1,
        backupId: "ESSAFARIA-SYNTHETIC-DR-LOCAL-0001",
        createdAt: new Date().toISOString(),
        source: {
          environment: "PRODUCTION",
          projectRef: PRODUCTION_PROJECT_REF,
          schema: PRODUCTION_SCHEMA,
          releaseSha: "0123456789abcdef0123456789abcdef01234567",
          migrationLedger: migrationResult.rows.map((row) => row.name),
        },
        database: {
          artifact: path.basename(encryptedPath),
          bytes: encryptedStats.size,
          sha256: await sha256File(encryptedPath),
          encrypted: true,
          rowCounts: await criticalRowCounts(sourcePool),
          sequences: sequenceResult.rows.map((row) => row.sequence_name),
        },
        storage: {
          mode: "DATABASE_BLOBS",
          objectCount: objects.length,
          totalBytes: objects.reduce((sum, row) => sum + row.sizeBytes, 0),
          manifestSha256: storageInventorySha256(objects),
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
        throw new Error(`Synthetic manifest did not enter CREATED state: ${assessment.findings.join("; ")}`);
      }
      await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", { mode: 0o600 });
    } finally {
      await sourcePool.end();
    }

    const binDir = path.dirname(pgBinary("pg_restore"));
    const childPath = [binDir, process.env.PATH].filter(Boolean).join(path.delimiter);
    const tsx = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");

    await run(process.execPath, [
      tsx,
      "scripts/dr-restore.ts",
      "--manifest",
      manifestPath,
      "--evidence-output",
      restoreEvidencePath,
    ], {
      ...process.env,
      PATH: childPath,
      NODE_ENV: "test",
      DR_ENVIRONMENT: "RESTORE_TEST",
      DATABASE_SCHEMA: PRODUCTION_SCHEMA,
      DATABASE_URL: connection(TARGET_DB),
      DR_BACKUP_KEY_BASE64: keyBase64,
      STORAGE_PROVIDER: "db",
    });

    const evidence = JSON.parse(await readFile(restoreEvidencePath, "utf8")) as RestoreEvidence;
    if (!evidence.databaseVerificationPassed || !evidence.walletReconciliationPassed || !evidence.storageReconciliationPassed) {
      throw new Error("Synthetic restore evidence did not record all technical reconciliations as passed.");
    }

    const originalManifest = JSON.parse(await readFile(manifestPath, "utf8")) as BackupManifest;
    const tamperedManifest: BackupManifest = {
      ...originalManifest,
      source: { ...originalManifest.source, migrationLedger: [...originalManifest.source.migrationLedger] },
      database: {
        ...originalManifest.database,
        rowCounts: {
          ...originalManifest.database.rowCounts,
          agencies: (originalManifest.database.rowCounts.agencies ?? 0) + 1,
        },
        sequences: [...originalManifest.database.sequences],
      },
      storage: { ...originalManifest.storage },
      verification: { ...originalManifest.verification },
    };
    await writeFile(tamperedManifestPath, JSON.stringify(tamperedManifest, null, 2) + "\n", { mode: 0o600 });
    const mismatch = await runExpectExit(process.execPath, [
      tsx,
      "scripts/dr-verify-restore.ts",
      "--expected-manifest",
      tamperedManifestPath,
    ], {
      ...process.env,
      PATH: childPath,
      NODE_ENV: "test",
      DR_ENVIRONMENT: "RESTORE_TEST",
      DATABASE_SCHEMA: PRODUCTION_SCHEMA,
      DATABASE_URL: connection(TARGET_DB),
      STORAGE_PROVIDER: "db",
    }, 2);
    if (!mismatch.stdout.includes("MANIFEST_ROW_COUNT_MISMATCH")) {
      throw new Error("Synthetic manifest mismatch test did not report row-count divergence.");
    }

    const restoredPool = new Pool({ connectionString: connection(TARGET_DB) });
    try {
      const wallet = await restoredPool.query<{ balance: string }>(
        `select balance::text from "${PRODUCTION_SCHEMA}".agencies where email='drill@example.invalid'`,
      );
      if (wallet.rows[0]?.balance !== "100.00") throw new Error("Restored wallet balance does not match synthetic source.");
      const blobs = await restoredPool.query<{ durable: number; staged: number }>(
        `select
           count(*) filter (where key='branding/synthetic-dr-logo')::int as durable,
           count(*) filter (where key like 'pending-request/%')::int as staged
         from "${PRODUCTION_SCHEMA}".document_blobs`,
      );
      if (Number(blobs.rows[0]?.durable) !== 1 || Number(blobs.rows[0]?.staged) !== 1) {
        throw new Error("Restored durable/ephemeral blob inventory does not match synthetic source.");
      }
    } finally {
      await restoredPool.end();
    }

    await import("node:fs/promises").then(({ mkdir }) => mkdir(path.dirname(offsiteCopyPath), { recursive: true }));
    await copyFile(encryptedPath, offsiteCopyPath);
    const offsiteStdout = await run(process.execPath, [
      tsx,
      "scripts/dr-verify-offsite-copy.ts",
      "--manifest",
      manifestPath,
      "--copy",
      offsiteCopyPath,
      "--location-ref",
      "SYNTHETIC-INDEPENDENT-STORE-0001",
      "--evidence-output",
      offsiteEvidencePath,
    ], {
      ...process.env,
      NODE_ENV: "test",
      DR_BACKUP_KEY_BASE64: keyBase64,
    });
    const offsiteResult = JSON.parse(offsiteStdout) as { status?: string; evidenceRef?: string };
    if (offsiteResult.status !== "PASS" || !offsiteResult.evidenceRef) {
      throw new Error("Synthetic off-site verification did not produce a PASS evidence reference.");
    }

    await run(process.execPath, [
      tsx,
      "scripts/dr-finalize.ts",
      "--manifest",
      manifestPath,
      "--restore-evidence",
      restoreEvidencePath,
      "--offsite-ref",
      offsiteResult.evidenceRef,
      "--application-ref",
      "SYNTHETIC-APPRECOVERY-DRILL-0001",
      "--tenant-ref",
      "SYNTHETIC-TENANTISO-DRILL-0001",
      "--output",
      verifiedManifestPath,
      "--attest-external-evidence-reviewed",
    ], {
      ...process.env,
      NODE_ENV: "test",
    });

    const verified = JSON.parse(await readFile(verifiedManifestPath, "utf8"));
    const finalAssessment = assessBackupManifest(verified, {
      environment: "PRODUCTION",
      projectRef: PRODUCTION_PROJECT_REF,
      schema: PRODUCTION_SCHEMA,
    });
    if (finalAssessment.status !== "VERIFIED") {
      throw new Error(`Synthetic finalized manifest is not VERIFIED: ${finalAssessment.findings.join("; ")}`);
    }

    console.log(JSON.stringify({
      status: "PASS",
      mode: "LOCAL_SYNTHETIC_DRILL",
      sourceDatabase: "synthetic",
      productionContacted: false,
      realCustomerDataUsed: false,
      migrationCount: finalAssessment.manifest?.source.migrationLedger.length ?? 0,
      encryptedBackupVerified: true,
      isolatedRestoreCompleted: true,
      walletReconciliationPassed: true,
      storageReconciliationPassed: true,
      ephemeralStorageClassificationExercised: true,
      evidenceBindingExercised: true,
      offsiteCopyByteIdentityVerified: true,
      offsiteCopyAuthenticationVerified: true,
      manifestMismatchRefusalExercised: true,
      finalManifestState: finalAssessment.status,
    }, null, 2));
  } finally {
    key.fill(0);
    if (pg) await pg.stop().catch(() => {});
    await rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Synthetic DR drill failed.");
  process.exitCode = 1;
});
