/**
 * Verify an ESSAFARIA DR backup manifest without contacting any database.
 *
 * Usage:
 *   npm run dr:manifest -- --manifest /secure/path/backup-manifest.json --source production
 *
 * This command never prints archive contents, connection strings, credentials,
 * applicant data or encryption keys. Exit 0 means VERIFIED; every other state
 * exits non-zero so it can be used as a hard gate before destructive work.
 */
import { readFile } from "node:fs/promises";
import {
  PRODUCTION_PROJECT_REF,
  PRODUCTION_SCHEMA,
  assessBackupManifest,
  type BackupEnvironment,
} from "./lib/dr-safety";

function options(args: string[]) {
  let manifestPath: string | undefined;
  let source = "production";
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--manifest") {
      manifestPath = args[++i];
      if (!manifestPath) throw new Error("--manifest requires a file path");
      continue;
    }
    if (arg === "--source") {
      source = args[++i] ?? "";
      if (!["production", "preview", "restore-test"].includes(source)) {
        throw new Error("--source must be production, preview or restore-test");
      }
      continue;
    }
    throw new Error("Unknown option. Use --manifest PATH [--source production|preview|restore-test].");
  }
  if (!manifestPath) throw new Error("--manifest is required");
  return { manifestPath, source };
}

async function main() {
  const { manifestPath, source } = options(process.argv.slice(2));
  let input: unknown;
  try {
    input = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    throw new Error("Backup manifest could not be read as JSON.");
  }

  const expected =
    source === "production"
      ? {
          environment: "PRODUCTION" as BackupEnvironment,
          projectRef: PRODUCTION_PROJECT_REF,
          schema: PRODUCTION_SCHEMA,
        }
      : source === "preview"
        ? {
            environment: "PREVIEW" as BackupEnvironment,
            projectRef: PRODUCTION_PROJECT_REF,
            schema: "visa_os_preview",
          }
        : { environment: "RESTORE_TEST" as BackupEnvironment };

  const assessment = assessBackupManifest(input, expected);
  console.log(JSON.stringify({
    status: assessment.status,
    backupId: assessment.manifest?.backupId ?? null,
    source: assessment.manifest
      ? {
          environment: assessment.manifest.source.environment,
          projectRef: assessment.manifest.source.projectRef,
          schema: assessment.manifest.source.schema,
          releaseSha: assessment.manifest.source.releaseSha,
          migrationCount: assessment.manifest.source.migrationLedger.length,
        }
      : null,
    createdAt: assessment.manifest?.createdAt ?? null,
    verifiedAt: assessment.manifest?.verification.verifiedAt ?? null,
    restoreTestedAt: assessment.manifest?.verification.restoreTestedAt ?? null,
    findings: assessment.findings,
  }, null, 2));

  if (assessment.status !== "VERIFIED") process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Backup manifest verification failed.");
  process.exitCode = 1;
});
