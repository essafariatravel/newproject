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
import type {
  RestoreEvidence,
  ApplicationRecoveryEvidence,
  TenantIsolationEvidence,
} from "./lib/dr-finalization";

const PORT = 5441;
const USER = "postgres";
const PASSWORD = "postgres";
const SOURCE_DB = "essafaria_dr_source";
const TARGET_DB = "essafaria_dr_target";
const APP_PORT = 3317;
const APP_BASE_URL = `http://127.0.0.1:${APP_PORT}`;

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
  const country = await pool.query<{ id: string }>(
    `insert into "${PRODUCTION_SCHEMA}".countries (name,iso2,region,active,sort_order)
     values ('Synthetic DR Country','DZ','Africa',true,10)
     returning id::text`,
  );
  const category = await pool.query<{ id: string }>(
    `insert into "${PRODUCTION_SCHEMA}".visa_categories (name,code,active,sort_order)
     values ('Synthetic DR Tourist','DR_TOURIST',true,10)
     returning id::text`,
  );
  const passportType = await pool.query<{ id: string }>(
    `insert into "${PRODUCTION_SCHEMA}".document_types
       (name,code,active,agency_uploadable,sort_order)
     values ('Synthetic DR Passport','DR_PASSPORT',true,true,10)
     returning id::text`,
  );
  const visa = await pool.query<{ id: string }>(
    `insert into "${PRODUCTION_SCHEMA}".visa_types
       (country_id,category_id,name,code,processing_min_days,processing_max_days,fee,currency,active,embassy_applicability)
     values ($1::uuid,$2::uuid,'Synthetic DR Visa','DR-VISA',2,5,120,'DZD',true,'NOT_APPLICABLE')
     returning id::text`,
    [country.rows[0]!.id, category.rows[0]!.id],
  );
  const status = await pool.query<{ id: string }>(
    `insert into "${PRODUCTION_SCHEMA}".statuses
       (code,name,sort_order,is_terminal,is_draft,active)
     values ('SUBMITTED','Submitted',20,false,false,true)
     returning id::text`,
  );
  const priority = await pool.query<{ id: string }>(
    `insert into "${PRODUCTION_SCHEMA}".priorities
       (code,name,weight,active,sort_order)
     values ('STANDARD','Standard',0,true,10)
     returning id::text`,
  );

  const agencies = await pool.query<{ id: string; email: string }>(
    `insert into "${PRODUCTION_SCHEMA}".agencies
       (legal_name,trading_name,email,city,country,status,balance,currency)
     values
       ('Synthetic DR Agency A','Synthetic DR A','dr-agency-a@example.invalid','Algiers','Algeria','ACTIVE',100,'DZD'),
       ('Synthetic DR Agency B','Synthetic DR B','dr-agency-b@example.invalid','Oran','Algeria','ACTIVE',0,'DZD')
     returning id::text,email`,
  );
  const agencyA = agencies.rows.find((row) => row.email === "dr-agency-a@example.invalid")!;
  const agencyB = agencies.rows.find((row) => row.email === "dr-agency-b@example.invalid")!;

  const staff = await pool.query<{ id: string }>(
    `insert into "${PRODUCTION_SCHEMA}".users
       (email,password_hash,name,role,status,activation_pending,credential_version,must_change_password)
     values ('dr-staff@example.invalid','DR_SESSION_ONLY','Synthetic DR Staff','SUPER_ADMIN','ACTIVE',false,0,false)
     returning id::text`,
  );
  const agencyUsers = await pool.query<{ id: string; agency_id: string; email: string }>(
    `insert into "${PRODUCTION_SCHEMA}".users
       (email,username,password_hash,name,role,agency_id,status,activation_pending,credential_version,must_change_password)
     values
       ('dr-a@example.invalid','dr-a','DR_SESSION_ONLY','Synthetic DR Agency A User','AGENCY_ADMIN',$1::uuid,'ACTIVE',false,0,false),
       ('dr-b@example.invalid','dr-b','DR_SESSION_ONLY','Synthetic DR Agency B User','AGENCY_ADMIN',$2::uuid,'ACTIVE',false,0,false)
     returning id::text,agency_id::text,email`,
    [agencyA.id, agencyB.id],
  );
  const agencyAUser = agencyUsers.rows.find((row) => row.email === "dr-a@example.invalid")!;

  const app = await pool.query<{ id: string }>(
    `insert into "${PRODUCTION_SCHEMA}".applications
       (reference,agency_id,country_id,visa_type_id,status_id,priority_id,
        visa_type_name,visa_type_code,category_name,country_name,fee,
        submitted_price,submitted_currency,effective_price,currency,
        processing_min_days,processing_max_days,created_by,submitted_at)
     values
       ('DR-APP-0001',$1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,
        'Synthetic DR Visa','DR-VISA','Synthetic DR Tourist','Synthetic DR Country',120,
        120,'DZD',120,'DZD',2,5,$6::uuid,now())
     returning id::text`,
    [
      agencyA.id,
      country.rows[0]!.id,
      visa.rows[0]!.id,
      status.rows[0]!.id,
      priority.rows[0]!.id,
      agencyAUser.id,
    ],
  );
  const applicationId = app.rows[0]!.id;

  const applicant = await pool.query<{ id: string }>(
    `insert into "${PRODUCTION_SCHEMA}".applicants
       (application_id,first_name,last_name,full_name,nationality)
     values ($1::uuid,'Synthetic','Traveller','Synthetic Traveller','Algerian')
     returning id::text`,
    [applicationId],
  );

  const checklist = await pool.query<{ id: string }>(
    `insert into "${PRODUCTION_SCHEMA}".checklist_items
       (application_id,document_type_id,document_type_name,document_type_code,required,sort_order,active)
     values ($1::uuid,$2::uuid,'Synthetic DR Passport','DR_PASSPORT',true,10,true)
     returning id::text`,
    [applicationId, passportType.rows[0]!.id],
  );

  const docBytes = Buffer.from("%PDF-1.4\n% ESSAFARIA synthetic DR document\n%%EOF\n");
  const documentId = (await pool.query<{ id: string }>("select gen_random_uuid()::text as id")).rows[0]!.id;
  const documentKey = `visa-documents/${applicationId}/${documentId}`;
  await pool.query(
    `insert into "${PRODUCTION_SCHEMA}".document_blobs (key,mime_type,size_bytes,data)
     values ($1,'application/pdf',$2,$3)`,
    [documentKey, docBytes.length, docBytes],
  );
  await pool.query(
    `insert into "${PRODUCTION_SCHEMA}".documents
       (id,application_id,applicant_id,checklist_item_id,document_type_id,
        original_filename,mime_type,size_bytes,storage_key,status,uploaded_by,version)
     values ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,
        'synthetic-dr-passport.pdf','application/pdf',$6,$7,'ACCEPTED',$8::uuid,1)`,
    [
      documentId,
      applicationId,
      applicant.rows[0]!.id,
      checklist.rows[0]!.id,
      passportType.rows[0]!.id,
      docBytes.length,
      documentKey,
      agencyAUser.id,
    ],
  );

  await pool.query(
    `insert into "${PRODUCTION_SCHEMA}".wallet_transactions
       (agency_id,type,amount,currency,balance_before,balance_after,reason,actor_id)
     values ($1::uuid,'CREDIT',100,'DZD',0,100,'Synthetic DR drill credit',$2::uuid)`,
    [agencyA.id, staff.rows[0]!.id],
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

async function waitForHttpReady(baseUrl: string, child: ReturnType<typeof spawn>): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error("Next.js recovery app exited before becoming ready.");
    try {
      const response = await fetch(`${baseUrl}/api/health`, { redirect: "manual" });
      if (response.status === 200) {
        await response.body?.cancel().catch(() => undefined);
        return;
      }
      await response.body?.cancel().catch(() => undefined);
    } catch {
      // Startup race; retry.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Next.js recovery app did not become ready within 60 seconds.");
}

async function stopChild(child: ReturnType<typeof spawn> | null): Promise<void> {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise<void>((resolve) => child.once("close", () => resolve())),
    new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function resolveSyntheticReleaseSha(): Promise<string> {
  const fromCi = process.env.GITHUB_SHA?.trim();
  if (fromCi && /^[0-9a-f]{40}$/i.test(fromCi)) return fromCi.toLowerCase();
  try {
    const value = (await run("git", ["rev-parse", "HEAD"], process.env)).trim();
    if (/^[0-9a-f]{40}$/i.test(value)) return value.toLowerCase();
  } catch {
    // Deterministic fallback for source archives without Git metadata.
  }
  return "0123456789abcdef0123456789abcdef01234567";
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
  const applicationEvidencePath = path.join(root, "synthetic.application-evidence.json");
  const tenantEvidencePath = path.join(root, "synthetic.tenant-evidence.json");
  const verifiedManifestPath = path.join(root, "synthetic.verified.manifest.json");
  const evidenceBundlePath = path.join(root, "synthetic.evidence-bundle.json");
  const tamperedManifestPath = path.join(root, "synthetic.tampered.manifest.json");
  const key = Buffer.alloc(32, 73);
  const keyBase64 = key.toString("base64");
  const releaseSha = await resolveSyntheticReleaseSha();
  let pg: InstanceType<typeof EmbeddedPostgres> | null = null;
  let appProcess: ReturnType<typeof spawn> | null = null;

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
      const objectResult = await sourcePool.query<{ key: string; size_bytes: number; sha256: string }>(
        `select key,size_bytes,encode(digest(data,'sha256'),'hex') as sha256
           from "${PRODUCTION_SCHEMA}".document_blobs
          order by key`,
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
      const objects = objectResult.rows.map((row) => ({
        key: row.key,
        sizeBytes: Number(row.size_bytes),
        sha256: row.sha256.toLowerCase(),
      }));
      const manifest: BackupManifest = {
        version: 1,
        backupId: "ESSAFARIA-SYNTHETIC-DR-LOCAL-0001",
        createdAt: new Date().toISOString(),
        source: {
          environment: "PRODUCTION",
          projectRef: PRODUCTION_PROJECT_REF,
          schema: PRODUCTION_SCHEMA,
          releaseSha,
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

    const nextBin = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
    try {
      await stat(path.join(process.cwd(), ".next", "BUILD_ID"));
    } catch {
      throw new Error("Synthetic application DR drill requires a completed Next.js build before execution.");
    }
    let appStderr = "";
    appProcess = spawn(process.execPath, [
      nextBin,
      "start",
      "-H",
      "127.0.0.1",
      "-p",
      String(APP_PORT),
    ], {
      env: {
        ...process.env,
        NODE_ENV: "production",
        DATABASE_URL: connection(TARGET_DB),
        DATABASE_SCHEMA: PRODUCTION_SCHEMA,
        STORAGE_PROVIDER: "db",
        VERCEL: "",
        VERCEL_ENV: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    appProcess.stderr?.on("data", (chunk) => {
      if (appStderr.length < 12000) appStderr += String(chunk);
    });
    await waitForHttpReady(APP_BASE_URL, appProcess);

    const appVerifyStdout = await run(process.execPath, [
      tsx,
      "scripts/dr-verify-restored-app.ts",
      "--manifest",
      manifestPath,
      "--restore-evidence",
      restoreEvidencePath,
      "--base-url",
      APP_BASE_URL,
      "--target-ref",
      "LOCAL-SYNTHETIC-APP-E2E-0001",
      "--application-evidence-output",
      applicationEvidencePath,
      "--tenant-evidence-output",
      tenantEvidencePath,
    ], {
      ...process.env,
      NODE_ENV: "test",
      DR_ENVIRONMENT: "RESTORE_TEST",
      DATABASE_SCHEMA: PRODUCTION_SCHEMA,
      DATABASE_URL: connection(TARGET_DB),
      STORAGE_PROVIDER: "db",
      DR_RESTORE_RELEASE_SHA: releaseSha,
      VERCEL: "",
      VERCEL_ENV: "",
    });
    const appVerifyResult = JSON.parse(appVerifyStdout) as {
      status?: string;
      applicationChecks?: Record<string, boolean>;
      tenantChecks?: Record<string, boolean>;
    };
    if (appVerifyResult.status !== "PASS") {
      throw new Error(`Synthetic application recovery verifier did not PASS.${appStderr ? " Inspect app startup logs." : ""}`);
    }
    await stopChild(appProcess);
    appProcess = null;

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
      "--offsite-evidence",
      offsiteEvidencePath,
      "--application-evidence",
      applicationEvidencePath,
      "--tenant-evidence",
      tenantEvidencePath,
      "--output",
      verifiedManifestPath,
      "--attest-external-evidence-reviewed",
    ], {
      ...process.env,
      NODE_ENV: "test",
    });

    await run(process.execPath, [
      tsx,
      "scripts/dr-evidence-bundle.ts",
      "--source-manifest",
      manifestPath,
      "--verified-manifest",
      verifiedManifestPath,
      "--restore-evidence",
      restoreEvidencePath,
      "--offsite-evidence",
      offsiteEvidencePath,
      "--application-evidence",
      applicationEvidencePath,
      "--tenant-evidence",
      tenantEvidencePath,
      "--output",
      evidenceBundlePath,
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
      realNextServerRecoveryE2E: true,
      structuredApplicationEvidenceExercised: true,
      structuredTenantEvidenceExercised: true,
      offsiteCopyByteIdentityVerified: true,
      offsiteCopyAuthenticationVerified: true,
      manifestMismatchRefusalExercised: true,
      evidenceBundleVerified: true,
      finalManifestState: finalAssessment.status,
    }, null, 2));
  } finally {
    await stopChild(appProcess).catch(() => {});
    key.fill(0);
    if (pg) await pg.stop().catch(() => {});
    await rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Synthetic DR drill failed.");
  process.exitCode = 1;
});
