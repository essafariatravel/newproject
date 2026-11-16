/**
 * Build a sanitized, cryptographically indexed DR evidence bundle.
 *
 * The bundle contains hashes and opaque references only. It never embeds
 * database dumps, encryption keys, document bytes, credentials or customer PII.
 */
import { readFile, writeFile } from "node:fs/promises";
import {
  PRODUCTION_PROJECT_REF,
  PRODUCTION_SCHEMA,
  assessBackupManifest,
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

function parseArgs(args: string[]) {
  const keys = [
    "--source-manifest",
    "--verified-manifest",
    "--restore-evidence",
    "--offsite-evidence",
    "--application-evidence",
    "--tenant-evidence",
    "--output",
  ] as const;
  const allowed = new Set<string>(keys);
  const values: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i]!;
    if (!allowed.has(key)) throw new Error("Unknown DR evidence-bundle option.");
    const value = args[++i];
    if (!value) throw new Error(`${key} requires a value.`);
    values[key] = value;
  }
  for (const key of keys) if (!values[key]) throw new Error(`${key} is required.`);
  return {
    sourceManifest: privateArtifactPath(values["--source-manifest"]!, "--source-manifest"),
    verifiedManifest: privateArtifactPath(values["--verified-manifest"]!, "--verified-manifest"),
    restoreEvidence: privateArtifactPath(values["--restore-evidence"]!, "--restore-evidence"),
    offsiteEvidence: privateArtifactPath(values["--offsite-evidence"]!, "--offsite-evidence"),
    applicationEvidence: privateArtifactPath(values["--application-evidence"]!, "--application-evidence"),
    tenantEvidence: privateArtifactPath(values["--tenant-evidence"]!, "--tenant-evidence"),
    output: privateArtifactPath(values["--output"]!, "--output", { requireAbsolute: true }),
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
  const sourceRaw = await json<unknown>(options.sourceManifest, "Source manifest");
  const sourceAssessment = assessBackupManifest(sourceRaw, {
    environment: "PRODUCTION",
    projectRef: PRODUCTION_PROJECT_REF,
    schema: PRODUCTION_SCHEMA,
  });
  if (!sourceAssessment.manifest || sourceAssessment.status === "INVALID") {
    throw new Error(`Source manifest is INVALID: ${sourceAssessment.findings.join("; ")}`);
  }
  const source: BackupManifest = sourceAssessment.manifest;

  const verifiedRaw = await json<unknown>(options.verifiedManifest, "Verified manifest");
  const verifiedAssessment = assessBackupManifest(verifiedRaw, {
    environment: "PRODUCTION",
    projectRef: PRODUCTION_PROJECT_REF,
    schema: PRODUCTION_SCHEMA,
  });
  if (!verifiedAssessment.manifest || verifiedAssessment.status !== "VERIFIED") {
    throw new Error(`Final manifest is not VERIFIED: ${verifiedAssessment.findings.join("; ")}`);
  }
  const verified = verifiedAssessment.manifest;
  if (
    verified.backupId !== source.backupId ||
    verified.source.releaseSha !== source.source.releaseSha ||
    verified.database.sha256 !== source.database.sha256 ||
    verified.database.bytes !== source.database.bytes
  ) {
    throw new Error("Verified manifest does not describe the same source backup.");
  }

  const restore = await json<RestoreEvidence>(options.restoreEvidence, "Restore evidence");
  const offsite = await json<OffsiteEvidence>(options.offsiteEvidence, "Off-site evidence");
  const application = await json<ApplicationRecoveryEvidence>(options.applicationEvidence, "Application evidence");
  const tenant = await json<TenantIsolationEvidence>(options.tenantEvidence, "Tenant-isolation evidence");

  const sourceManifestSha256 = await sha256File(options.sourceManifest);
  const restoreEvidenceSha256 = await sha256File(options.restoreEvidence);
  const offsiteEvidenceSha256 = await sha256File(options.offsiteEvidence);
  const applicationEvidenceSha256 = await sha256File(options.applicationEvidence);
  const tenantEvidenceSha256 = await sha256File(options.tenantEvidence);
  const verifiedManifestSha256 = await sha256File(options.verifiedManifest);

  const findings = [
    ...validateRestoreEvidence(restore, source, sourceManifestSha256),
    ...validateOffsiteEvidence(offsite, source, sourceManifestSha256),
    ...validateApplicationEvidence(application, source, restoreEvidenceSha256, restore.restoredAt),
    ...validateTenantIsolationEvidence(tenant, source, restoreEvidenceSha256, restore.restoredAt),
  ];
  if (verified.verification.restoreEvidenceSha256 !== restoreEvidenceSha256) {
    findings.push("verified manifest restore evidence hash does not match supplied evidence");
  }
  if (verified.verification.offsiteEvidenceRef !== `OFFSITE-${offsiteEvidenceSha256}`) {
    findings.push("verified manifest off-site evidence reference does not match supplied evidence");
  }
  if (verified.verification.applicationEvidenceRef !== `APPLICATION-${applicationEvidenceSha256}`) {
    findings.push("verified manifest application evidence reference does not match supplied evidence");
  }
  if (verified.verification.tenantIsolationEvidenceRef !== `TENANT-${tenantEvidenceSha256}`) {
    findings.push("verified manifest tenant-isolation evidence reference does not match supplied evidence");
  }
  if (findings.length) throw new Error(`Evidence bundle validation failed: ${findings.join("; ")}`);

  const bundle = {
    version: 1,
    kind: "ESSAFARIA_DR_EVIDENCE_BUNDLE",
    status: "VERIFIED",
    generatedAt: new Date().toISOString(),
    backupId: source.backupId,
    source: {
      environment: source.source.environment,
      projectRef: source.source.projectRef,
      schema: source.source.schema,
      releaseSha: source.source.releaseSha,
      createdAt: source.createdAt,
      verifiedAt: verified.verification.verifiedAt,
    },
    recovery: {
      restoredAt: restore.restoredAt,
      restoreTargetMode: restore.target.mode,
      restoreTargetSchema: restore.target.schema,
      offsiteLocationRef: offsite.locationRef,
      applicationTargetRef: application.targetRef,
      tenantTargetRef: tenant.targetRef,
      foreignTenantFixture: tenant.foreignTenantFixture,
    },
    artifacts: {
      sourceManifestSha256,
      verifiedManifestSha256,
      encryptedDatabaseSha256: source.database.sha256,
      restoreEvidenceSha256,
      offsiteEvidenceSha256,
      applicationEvidenceSha256,
      tenantIsolationEvidenceSha256: tenantEvidenceSha256,
    },
    checks: {
      backupManifestVerified: true,
      restoreEvidenceVerified: true,
      offsiteCopyVerified: true,
      applicationRecoveryVerified: true,
      tenantIsolationVerified: true,
      walletReconciliationVerified: verified.verification.walletReconciliationPassed,
      storageReconciliationVerified: verified.verification.storageReconciliationPassed,
    },
    containsSecrets: false,
    containsCustomerPii: false,
  };

  await writeFile(options.output, JSON.stringify(bundle, null, 2) + "\n", {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
  console.log(JSON.stringify({
    status: "PASS",
    backupId: source.backupId,
    bundleSha256: await sha256File(options.output),
    releaseSha: source.source.releaseSha,
    privateDataPrinted: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "DR evidence bundle failed safely.");
  process.exitCode = 1;
});
