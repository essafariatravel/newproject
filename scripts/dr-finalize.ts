/**
 * Promote a CREATED ESSAFARIA backup manifest to VERIFIED only after all
 * technical and external evidence is explicitly bound to it.
 *
 * This command does not perform or invent off-site/application/tenant checks.
 * It records operator-reviewed evidence references and refuses finalization
 * without an explicit attestation flag.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { privateArtifactPath } from "./lib/dr-private-path";
import {
  PRODUCTION_PROJECT_REF,
  PRODUCTION_SCHEMA,
  assessBackupManifest,
} from "./lib/dr-safety";
import {
  finalizeBackupManifest,
  type RestoreEvidence,
  type OffsiteEvidence,
  type ApplicationRecoveryEvidence,
  type TenantIsolationEvidence,
} from "./lib/dr-finalization";
import { sha256File } from "./lib/dr-backup";

function parseArgs(args: string[]) {
  const values: Record<string, string> = {};
  let attested = false;
  const valued = new Set([
    "--manifest",
    "--restore-evidence",
    "--offsite-evidence",
    "--application-evidence",
    "--tenant-evidence",
    "--output",
  ]);
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    if (arg === "--attest-external-evidence-reviewed") {
      attested = true;
      continue;
    }
    if (!valued.has(arg)) throw new Error("Unknown DR finalization option.");
    const value = args[++index];
    if (!value) throw new Error(`${arg} requires a value.`);
    values[arg] = value;
  }
  for (const key of valued) {
    if (!values[key]) throw new Error(`${key} is required.`);
  }
  return {
    manifestPath: privateArtifactPath(values["--manifest"]!, "--manifest"),
    restoreEvidencePath: privateArtifactPath(values["--restore-evidence"]!, "--restore-evidence"),
    offsiteEvidencePath: privateArtifactPath(values["--offsite-evidence"]!, "--offsite-evidence"),
    applicationEvidencePath: privateArtifactPath(values["--application-evidence"]!, "--application-evidence"),
    tenantEvidencePath: privateArtifactPath(values["--tenant-evidence"]!, "--tenant-evidence"),
    output: privateArtifactPath(values["--output"]!, "--output", { requireAbsolute: true }),
    attested,
  };
}

async function readJson(pathname: string, label: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(pathname, "utf8"));
  } catch {
    throw new Error(`${label} could not be read as JSON.`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const rawManifest = await readJson(options.manifestPath, "Backup manifest");
  const assessment = assessBackupManifest(rawManifest, {
    environment: "PRODUCTION",
    projectRef: PRODUCTION_PROJECT_REF,
    schema: PRODUCTION_SCHEMA,
  });
  if (!assessment.manifest || assessment.status === "INVALID") {
    throw new Error(`Backup manifest is INVALID: ${assessment.findings.join("; ")}`);
  }

  const rawEvidence = await readJson(options.restoreEvidencePath, "Restore evidence");
  if (!rawEvidence || typeof rawEvidence !== "object" || Array.isArray(rawEvidence)) {
    throw new Error("Restore evidence must be a JSON object.");
  }
  const rawOffsiteEvidence = await readJson(options.offsiteEvidencePath, "Off-site evidence");
  if (!rawOffsiteEvidence || typeof rawOffsiteEvidence !== "object" || Array.isArray(rawOffsiteEvidence)) {
    throw new Error("Off-site evidence must be a JSON object.");
  }
  const rawApplicationEvidence = await readJson(options.applicationEvidencePath, "Application evidence");
  if (!rawApplicationEvidence || typeof rawApplicationEvidence !== "object" || Array.isArray(rawApplicationEvidence)) {
    throw new Error("Application evidence must be a JSON object.");
  }
  const rawTenantEvidence = await readJson(options.tenantEvidencePath, "Tenant-isolation evidence");
  if (!rawTenantEvidence || typeof rawTenantEvidence !== "object" || Array.isArray(rawTenantEvidence)) {
    throw new Error("Tenant-isolation evidence must be a JSON object.");
  }

  const result = finalizeBackupManifest({
    manifest: assessment.manifest,
    sourceManifestSha256: await sha256File(options.manifestPath),
    restoreEvidence: rawEvidence as RestoreEvidence,
    restoreEvidenceSha256: await sha256File(options.restoreEvidencePath),
    offsiteEvidence: rawOffsiteEvidence as OffsiteEvidence,
    offsiteEvidenceSha256: await sha256File(options.offsiteEvidencePath),
    applicationEvidence: rawApplicationEvidence as ApplicationRecoveryEvidence,
    applicationEvidenceSha256: await sha256File(options.applicationEvidencePath),
    tenantIsolationEvidence: rawTenantEvidence as TenantIsolationEvidence,
    tenantIsolationEvidenceSha256: await sha256File(options.tenantEvidencePath),
    externalEvidenceAttested: options.attested,
  });
  if (!result.manifest) {
    console.error(JSON.stringify({ status: "REFUSED", findings: result.findings }, null, 2));
    process.exitCode = 2;
    return;
  }

  await writeFile(options.output, JSON.stringify(result.manifest, null, 2) + "\n", {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });

  console.log(JSON.stringify({
    status: "VERIFIED",
    backupId: result.manifest.backupId,
    output: options.output,
    verifiedAt: result.manifest.verification.verifiedAt,
    evidence: {
      restoreEvidenceSha256: result.manifest.verification.restoreEvidenceSha256,
      offsiteEvidenceRef: result.manifest.verification.offsiteEvidenceRef,
      applicationEvidenceRef: result.manifest.verification.applicationEvidenceRef,
      tenantIsolationEvidenceRef: result.manifest.verification.tenantIsolationEvidenceRef,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "DR finalization failed safely.");
  process.exitCode = 1;
});
