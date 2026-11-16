/**
 * Final offline DR release gate.
 *
 * This is the one-command guard for pilot/go-live readiness after the real
 * external recovery drill has produced a VERIFIED manifest and evidence bundle.
 * It performs no network/database action.
 */
import { readFile } from "node:fs/promises";
import {
  PRODUCTION_PROJECT_REF,
  PRODUCTION_SCHEMA,
  assessBackupManifest,
  backupFreshnessFindings,
} from "./lib/dr-safety";
import { sha256File } from "./lib/dr-backup";
import { privateArtifactPath } from "./lib/dr-private-path";

const SHA = /^[0-9a-f]{40}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;

function parseArgs(args: string[]) {
  const values: Record<string, string> = {};
  const allowed = new Set(["--verified-manifest", "--evidence-bundle", "--expected-release-sha", "--max-age-hours"]);
  for (let i = 0; i < args.length; i++) {
    const key = args[i]!;
    if (!allowed.has(key)) throw new Error("Unknown DR release-gate option.");
    const value = args[++i];
    if (!value) throw new Error(`${key} requires a value.`);
    values[key] = value;
  }
  for (const key of ["--verified-manifest","--evidence-bundle","--expected-release-sha"]) {
    if (!values[key]) throw new Error(`${key} is required.`);
  }
  const releaseSha = values["--expected-release-sha"]!.trim().toLowerCase();
  if (!SHA.test(releaseSha)) throw new Error("--expected-release-sha must be a full 40-character Git SHA.");
  const maxAgeHours = values["--max-age-hours"] ? Number(values["--max-age-hours"]) : 24;
  if (!Number.isFinite(maxAgeHours) || maxAgeHours <= 0) throw new Error("--max-age-hours must be positive.");
  return {
    verifiedManifest: privateArtifactPath(values["--verified-manifest"]!, "--verified-manifest"),
    evidenceBundle: privateArtifactPath(values["--evidence-bundle"]!, "--evidence-bundle"),
    releaseSha,
    maxAgeHours,
  };
}

async function json(filename: string, label: string): Promise<Record<string, unknown>> {
  try {
    const value = JSON.parse(await readFile(filename, "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new Error(`${label} could not be read as a JSON object.`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const manifestRaw = await json(options.verifiedManifest, "Verified manifest");
  const assessment = assessBackupManifest(manifestRaw, {
    environment: "PRODUCTION",
    projectRef: PRODUCTION_PROJECT_REF,
    schema: PRODUCTION_SCHEMA,
  });
  if (!assessment.manifest || assessment.status !== "VERIFIED") {
    console.log(JSON.stringify({
      status: "BLOCKED",
      findings: assessment.findings.length ? assessment.findings : ["manifest is not VERIFIED"],
    }, null, 2));
    process.exitCode = 2;
    return;
  }

  const manifest = assessment.manifest;
  const findings = backupFreshnessFindings(manifest, options.maxAgeHours);
  if (manifest.source.releaseSha.toLowerCase() !== options.releaseSha) {
    findings.push("VERIFIED backup release SHA does not match the expected release.");
  }

  const bundle = await json(options.evidenceBundle, "Evidence bundle");
  if (bundle.version !== 1 || bundle.kind !== "ESSAFARIA_DR_EVIDENCE_BUNDLE" || bundle.status !== "VERIFIED") {
    findings.push("evidence bundle format/status is invalid");
  }
  if (bundle.backupId !== manifest.backupId) findings.push("evidence bundle backupId does not match VERIFIED manifest");

  const source = bundle.source && typeof bundle.source === "object" && !Array.isArray(bundle.source)
    ? bundle.source as Record<string, unknown>
    : {};
  if (source.projectRef !== PRODUCTION_PROJECT_REF || source.schema !== PRODUCTION_SCHEMA) {
    findings.push("evidence bundle source identity is not Production");
  }
  if (typeof source.releaseSha !== "string" || source.releaseSha.toLowerCase() !== options.releaseSha) {
    findings.push("evidence bundle release SHA does not match expected release");
  }

  const artifacts = bundle.artifacts && typeof bundle.artifacts === "object" && !Array.isArray(bundle.artifacts)
    ? bundle.artifacts as Record<string, unknown>
    : {};
  const verifiedManifestSha256 = await sha256File(options.verifiedManifest);
  if (artifacts.verifiedManifestSha256 !== verifiedManifestSha256) {
    findings.push("evidence bundle is not bound to this VERIFIED manifest");
  }
  for (const key of [
    "sourceManifestSha256",
    "verifiedManifestSha256",
    "encryptedDatabaseSha256",
    "restoreEvidenceSha256",
    "offsiteEvidenceSha256",
    "applicationEvidenceSha256",
    "tenantIsolationEvidenceSha256",
  ]) {
    if (typeof artifacts[key] !== "string" || !SHA256.test(artifacts[key] as string)) {
      findings.push(`evidence bundle artifact digest is invalid: ${key}`);
    }
  }

  if (artifacts.encryptedDatabaseSha256 !== manifest.database.sha256) {
    findings.push("evidence bundle encrypted database digest does not match VERIFIED manifest");
  }
  if (artifacts.restoreEvidenceSha256 !== manifest.verification.restoreEvidenceSha256) {
    findings.push("evidence bundle restore evidence digest does not match VERIFIED manifest");
  }
  if (`OFFSITE-${artifacts.offsiteEvidenceSha256}` !== manifest.verification.offsiteEvidenceRef) {
    findings.push("evidence bundle off-site evidence does not match VERIFIED manifest");
  }
  if (`APPLICATION-${artifacts.applicationEvidenceSha256}` !== manifest.verification.applicationEvidenceRef) {
    findings.push("evidence bundle application evidence does not match VERIFIED manifest");
  }
  if (`TENANT-${artifacts.tenantIsolationEvidenceSha256}` !== manifest.verification.tenantIsolationEvidenceRef) {
    findings.push("evidence bundle tenant evidence does not match VERIFIED manifest");
  }

  const checks = bundle.checks && typeof bundle.checks === "object" && !Array.isArray(bundle.checks)
    ? bundle.checks as Record<string, unknown>
    : {};
  for (const key of [
    "backupManifestVerified",
    "restoreEvidenceVerified",
    "offsiteCopyVerified",
    "applicationRecoveryVerified",
    "tenantIsolationVerified",
    "walletReconciliationVerified",
    "storageReconciliationVerified",
  ]) {
    if (checks[key] !== true) findings.push(`evidence bundle check is not true: ${key}`);
  }
  if (bundle.containsSecrets !== false || bundle.containsCustomerPii !== false) {
    findings.push("evidence bundle privacy flags are unsafe");
  }

  const createdAt = Date.parse(manifest.createdAt);
  const ageHours = Number.isNaN(createdAt) ? null : (Date.now() - createdAt) / 3_600_000;
  const pass = findings.length === 0;
  console.log(JSON.stringify({
    status: pass ? "PASS" : "BLOCKED",
    gate: "ESSAFARIA_DR_RELEASE_GATE",
    backupId: manifest.backupId,
    releaseSha: options.releaseSha,
    verifiedAt: manifest.verification.verifiedAt,
    backupAgeHours: ageHours === null ? null : Math.max(0, Number(ageHours.toFixed(2))),
    maxAgeHours: options.maxAgeHours,
    findings,
    productionModified: false,
  }, null, 2));
  if (!pass) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "DR release gate failed safely.");
  process.exitCode = 1;
});
