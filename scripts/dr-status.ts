/**
 * Offline DR readiness status.
 *
 * Summarizes the current backup/evidence state without contacting a database,
 * provider or application. It prints no archive contents or credentials.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  PRODUCTION_PROJECT_REF,
  PRODUCTION_SCHEMA,
  assessBackupManifest,
  backupFreshnessFindings,
  type BackupManifest,
} from "./lib/dr-safety";
import {
  validateApplicationEvidence,
  validateOffsiteEvidence,
  validateRestoreEvidence,
  validateTenantIsolationEvidence,
  type ApplicationRecoveryEvidence,
  type OffsiteEvidence,
  type RestoreEvidence,
  type TenantIsolationEvidence,
} from "./lib/dr-finalization";
import { sha256File } from "./lib/dr-backup";
import { privateArtifactPath } from "./lib/dr-private-path";

interface Options {
  manifest: string;
  restoreEvidence?: string;
  offsiteEvidence?: string;
  applicationEvidence?: string;
  tenantEvidence?: string;
  maxAgeHours: number;
}

function parseArgs(args: string[]): Options {
  const values: Record<string, string> = {};
  const allowed = new Set([
    "--manifest",
    "--restore-evidence",
    "--offsite-evidence",
    "--application-evidence",
    "--tenant-evidence",
    "--max-age-hours",
  ]);
  for (let i = 0; i < args.length; i++) {
    const key = args[i]!;
    if (!allowed.has(key)) throw new Error("Unknown DR status option.");
    const value = args[++i];
    if (!value) throw new Error(`${key} requires a value.`);
    values[key] = value;
  }
  if (!values["--manifest"]) throw new Error("--manifest is required.");
  const maxAgeHours = values["--max-age-hours"] ? Number(values["--max-age-hours"]) : 24;
  if (!Number.isFinite(maxAgeHours) || maxAgeHours <= 0) throw new Error("--max-age-hours must be a positive number.");
  const optional = (key: string) => values[key] ? privateArtifactPath(values[key]!, key) : undefined;
  return {
    manifest: privateArtifactPath(values["--manifest"]!, "--manifest"),
    restoreEvidence: optional("--restore-evidence"),
    offsiteEvidence: optional("--offsite-evidence"),
    applicationEvidence: optional("--application-evidence"),
    tenantEvidence: optional("--tenant-evidence"),
    maxAgeHours,
  };
}

async function json<T>(filename: string, label: string): Promise<T> {
  try {
    return JSON.parse(await readFile(filename, "utf8")) as T;
  } catch {
    throw new Error(`${label} could not be read as JSON.`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const raw = await json<unknown>(options.manifest, "Backup manifest");
  const assessment = assessBackupManifest(raw, {
    environment: "PRODUCTION",
    projectRef: PRODUCTION_PROJECT_REF,
    schema: PRODUCTION_SCHEMA,
  });

  if (!assessment.manifest || assessment.status === "INVALID") {
    console.log(JSON.stringify({
      status: "INVALID",
      stage: "INVALID",
      findings: assessment.findings,
    }, null, 2));
    process.exitCode = 2;
    return;
  }

  const manifest: BackupManifest = assessment.manifest;
  const freshness = backupFreshnessFindings(manifest, options.maxAgeHours);
  if (assessment.status === "VERIFIED") {
    const fresh = freshness.length === 0;
    console.log(JSON.stringify({
      status: "VERIFIED",
      stage: fresh ? "VERIFIED_FRESH" : "VERIFIED_STALE",
      backupId: manifest.backupId,
      createdAt: manifest.createdAt,
      verifiedAt: manifest.verification.verifiedAt,
      maxAgeHours: options.maxAgeHours,
      findings: freshness,
    }, null, 2));
    if (!fresh) process.exitCode = 2;
    return;
  }

  const supplied = {
    restore: Boolean(options.restoreEvidence),
    offsite: Boolean(options.offsiteEvidence),
    application: Boolean(options.applicationEvidence),
    tenantIsolation: Boolean(options.tenantEvidence),
  };
  const allSupplied = Object.values(supplied).every(Boolean);
  const findings = [...freshness];

  if (!allSupplied) {
    console.log(JSON.stringify({
      status: "CREATED",
      stage: "CREATED_NEEDS_EVIDENCE",
      backupId: manifest.backupId,
      supplied,
      missing: Object.entries(supplied).filter(([, present]) => !present).map(([name]) => name),
      findings,
    }, null, 2));
    process.exitCode = 2;
    return;
  }

  const sourceManifestSha256 = await sha256File(options.manifest);
  const restore = await json<RestoreEvidence>(options.restoreEvidence!, "Restore evidence");
  const offsite = await json<OffsiteEvidence>(options.offsiteEvidence!, "Off-site evidence");
  const application = await json<ApplicationRecoveryEvidence>(options.applicationEvidence!, "Application evidence");
  const tenant = await json<TenantIsolationEvidence>(options.tenantEvidence!, "Tenant-isolation evidence");
  const restoreEvidenceSha256 = await sha256File(options.restoreEvidence!);

  findings.push(...validateRestoreEvidence(restore, manifest, sourceManifestSha256));
  findings.push(...validateOffsiteEvidence(offsite, manifest, sourceManifestSha256));
  findings.push(...validateApplicationEvidence(
    application,
    manifest,
    restoreEvidenceSha256,
    restore.restoredAt,
  ));
  findings.push(...validateTenantIsolationEvidence(
    tenant,
    manifest,
    restoreEvidenceSha256,
    restore.restoredAt,
  ));

  const ready = findings.length === 0;
  console.log(JSON.stringify({
    status: "CREATED",
    stage: ready ? "READY_TO_FINALIZE" : "EVIDENCE_INVALID",
    backupId: manifest.backupId,
    supplied,
    evidence: {
      sourceManifestSha256,
      restoreEvidenceSha256,
      offsiteEvidenceSha256: await sha256File(options.offsiteEvidence!),
      applicationEvidenceSha256: await sha256File(options.applicationEvidence!),
      tenantIsolationEvidenceSha256: await sha256File(options.tenantEvidence!),
    },
    maxAgeHours: options.maxAgeHours,
    findings,
  }, null, 2));
  if (!ready) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "DR status failed safely.");
  process.exitCode = 1;
});
