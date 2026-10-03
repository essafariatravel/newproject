/**
 * Restore one encrypted ESSAFARIA backup into a disposable recovery database.
 *
 * This script has no Production path:
 * - assessRestoreTarget() refuses the Production Supabase project and deployed runtimes
 * - target schema must not already exist
 * - pg_restore never uses --clean and never restores over an existing ESSAFARIA schema
 *
 * Required:
 *   DR_ENVIRONMENT=RESTORE_TEST
 *   DATABASE_URL=<local or explicitly approved disposable DB>
 *   DATABASE_SCHEMA=visa_os
 *   DR_BACKUP_KEY_BASE64=<same 32-byte base64 key used for the archive>
 *
 * Remote disposable Supabase additionally requires:
 *   DR_ALLOW_REMOTE_DISPOSABLE=true
 *   DR_DISPOSABLE_PROJECT_REF=<non-Production project ref>
 *
 * Usage:
 *   npm run dr:restore -- --manifest /private/ESSAFARIA-...manifest.json
 */
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Pool } from "pg";
import {
  PRODUCTION_PROJECT_REF,
  PRODUCTION_SCHEMA,
  assessBackupManifest,
  assessRestoreTarget,
} from "./lib/dr-safety";
import type { RestoreEvidence } from "./lib/dr-finalization";
import { privateArtifactPath } from "./lib/dr-private-path";
import {
  backupKeyFromEnvironment,
  decryptFileAes256Gcm,
  pgEnvironmentFromUrl,
  sha256File,
} from "./lib/dr-backup";

function parseArgs(args: string[]) {
  let manifestPath: string | undefined;
  let artifactPath: string | undefined;
  let evidenceOutput: string | undefined;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--manifest") {
      manifestPath = args[++index];
      if (!manifestPath) throw new Error("--manifest requires a path");
      continue;
    }
    if (args[index] === "--artifact") {
      artifactPath = args[++index];
      if (!artifactPath) throw new Error("--artifact requires a path");
      continue;
    }
    if (args[index] === "--evidence-output") {
      evidenceOutput = args[++index];
      if (!evidenceOutput) throw new Error("--evidence-output requires a path");
      continue;
    }
    throw new Error("Unknown option. Use --manifest PATH [--artifact PATH] [--evidence-output PATH].");
  }
  if (!manifestPath) throw new Error("--manifest is required");
  return {
    manifestPath: privateArtifactPath(manifestPath, "--manifest"),
    artifactPath: artifactPath ? privateArtifactPath(artifactPath, "--artifact") : null,
    evidenceOutput: evidenceOutput
      ? privateArtifactPath(evidenceOutput, "--evidence-output", { requireAbsolute: true })
      : null,
  };
}

function run(binary: string, args: string[], env: NodeJS.ProcessEnv, inherit = false): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      env,
      stdio: inherit ? "inherit" : ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    if (!inherit) {
      child.stdout?.on("data", (chunk) => { stdout += String(chunk); });
      child.stderr?.on("data", (chunk) => { if (stderr.length < 8000) stderr += String(chunk); });
    }
    child.once("error", () => reject(new Error(`${binary} could not be started. Install a compatible PostgreSQL client.`)));
    child.once("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${binary} failed (exit ${code ?? "unknown"}). ${stderr ? "Discard the disposable target and review local operator logs." : ""}`));
    });
  });
}

async function main() {
  const { manifestPath, artifactPath: explicitArtifact, evidenceOutput } = parseArgs(process.argv.slice(2));
  const target = assessRestoreTarget(process.env);
  if (!target.safe || !target.schema) {
    console.error(JSON.stringify({ status: "REFUSED", findings: target.findings }, null, 2));
    process.exitCode = 2;
    return;
  }

  let manifestInput: unknown;
  try {
    manifestInput = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    throw new Error("Backup manifest could not be read as JSON.");
  }
  const assessment = assessBackupManifest(manifestInput, {
    environment: "PRODUCTION",
    projectRef: PRODUCTION_PROJECT_REF,
    schema: PRODUCTION_SCHEMA,
  });
  if (assessment.status === "INVALID" || !assessment.manifest) {
    throw new Error(`Backup manifest is INVALID: ${assessment.findings.join("; ")}`);
  }
  const manifest = assessment.manifest;
  const sourceManifestSha256 = await sha256File(manifestPath);
  if (target.schema !== manifest.source.schema) {
    throw new Error(`DATABASE_SCHEMA must equal the source schema ${manifest.source.schema}; pg_restore does not rename the selected schema.`);
  }

  const artifactPath = explicitArtifact ?? path.join(path.dirname(manifestPath), manifest.database.artifact);
  if (path.basename(artifactPath) !== manifest.database.artifact) {
    throw new Error("Encrypted artifact filename does not match the backup manifest.");
  }
  const artifactStat = await stat(artifactPath);
  if (artifactStat.size !== manifest.database.bytes) throw new Error("Encrypted artifact size does not match the manifest.");
  const actualSha = await sha256File(artifactPath);
  if (actualSha !== manifest.database.sha256) throw new Error("Encrypted artifact SHA-256 does not match the manifest.");

  const key = backupKeyFromEnvironment(process.env.DR_BACKUP_KEY_BASE64);
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "essafaria-restore-"));
  const rawDump = path.join(tempDir, "database.dump");
  try {
    await decryptFileAes256Gcm(artifactPath, rawDump, key);
    const targetUrl = process.env.DATABASE_URL!;
    const pgEnv = pgEnvironmentFromUrl(targetUrl);
    await run("pg_restore", ["--version"], pgEnv);
    await run("pg_restore", ["--list", rawDump], pgEnv);

    const pool = new Pool({ connectionString: targetUrl });
    const client = await pool.connect();
    try {
      const existing = await client.query<{ existing: string | null }>(
        "select to_regnamespace($1)::text as existing",
        [target.schema],
      );
      if (existing.rows[0]?.existing) {
        throw new Error(`Disposable target already contains schema ${target.schema}; refuse to restore over existing data. Create a fresh target.`);
      }
    } finally {
      client.release();
      await pool.end();
    }

    await run("pg_restore", [
      "--exit-on-error",
      "--no-owner",
      "--no-acl",
      `--dbname=${pgEnv.PGDATABASE}`,
      rawDump,
    ], pgEnv, true);

    const tsx = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
    await run(process.execPath, [
      tsx,
      "scripts/dr-verify-restore.ts",
      "--expected-manifest",
      manifestPath,
    ], {
      ...process.env,
      STORAGE_PROVIDER: "db",
    }, true);

    const evidencePath = evidenceOutput ??
      privateArtifactPath(
        path.join(path.dirname(manifestPath), `${manifest.backupId}.restore-evidence.json`),
        "restore evidence output",
      );
    const restoredAt = new Date().toISOString();
    const evidence: RestoreEvidence = {
      version: 1,
      kind: "ESSAFARIA_DR_RESTORE",
      backupId: manifest.backupId,
      sourceManifestSha256,
      restoredAt,
      target: {
        mode: target.mode!,
        schema: target.schema,
        projectRef: target.mode === "REMOTE_DISPOSABLE" ? process.env.DR_DISPOSABLE_PROJECT_REF ?? null : null,
      },
      databaseVerificationPassed: true,
      walletReconciliationPassed: true,
      storageReconciliationPassed: true,
    };
    await writeFile(evidencePath, JSON.stringify(evidence, null, 2) + "\n", {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    const restoreEvidenceSha256 = await sha256File(evidencePath);

    console.log(JSON.stringify({
      status: "RESTORED_AND_DATABASE_VERIFIED",
      backupId: manifest.backupId,
      target: { mode: target.mode, schema: target.schema },
      restoreEvidence: evidencePath,
      restoreEvidenceSha256,
      remainingBeforeBackupCanBecomeVERIFIED: [
        "independent/off-site copy proof",
        "application login/read validation on the restored target",
        "tenant-isolation validation on the restored target",
        "finalize with explicit external evidence references",
      ],
    }, null, 2));
  } catch (error) {
    console.error("If pg_restore started before this failure, discard the entire disposable target; do not repair or reuse a partial restore.");
    throw error;
  } finally {
    key.fill(0);
    await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Isolated restore failed safely.");
  process.exitCode = 1;
});
