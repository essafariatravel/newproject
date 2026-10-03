/**
 * Verify an independent encrypted backup copy and emit evidence without exposing
 * its filesystem path, credentials, or encryption key.
 *
 * This command does not copy data anywhere. It proves that a copy already
 * retrieved/mounted by an authorized operator is byte-identical to the backup
 * manifest and decrypts/authenticates with the separately held recovery key.
 */
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  PRODUCTION_PROJECT_REF,
  PRODUCTION_SCHEMA,
  assessBackupManifest,
} from "./lib/dr-safety";
import {
  backupKeyFromEnvironment,
  sha256File,
  verifyEncryptedFileAes256Gcm,
} from "./lib/dr-backup";

const REF = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/;

interface OffsiteEvidence {
  version: 1;
  kind: "ESSAFARIA_DR_OFFSITE_COPY";
  backupId: string;
  sourceManifestSha256: string;
  verifiedAt: string;
  locationRef: string;
  databaseBytes: number;
  databaseSha256: string;
  encryptedAuthenticationVerified: true;
}

function parseArgs(args: string[]) {
  const values: Record<string, string> = {};
  const allowed = new Set(["--manifest", "--copy", "--location-ref", "--evidence-output"]);
  for (let index = 0; index < args.length; index++) {
    const key = args[index]!;
    if (!allowed.has(key)) throw new Error("Unknown off-site verification option.");
    const value = args[++index];
    if (!value) throw new Error(`${key} requires a value.`);
    values[key] = value;
  }
  for (const key of allowed) if (!values[key]) throw new Error(`${key} is required.`);
  if (!REF.test(values["--location-ref"]!)) {
    throw new Error("--location-ref must be an opaque 8-160 character identifier, not a secret/path/free-form note.");
  }
  const evidenceOutput = path.resolve(values["--evidence-output"]!);
  if (!path.isAbsolute(values["--evidence-output"]!)) throw new Error("--evidence-output must be an absolute private path.");
  const cwd = path.resolve(process.cwd()) + path.sep;
  if ((evidenceOutput + path.sep).startsWith(cwd)) {
    throw new Error("Off-site evidence must be written outside the repository working tree.");
  }
  return {
    manifestPath: path.resolve(values["--manifest"]!),
    copyPath: path.resolve(values["--copy"]!),
    locationRef: values["--location-ref"]!,
    evidenceOutput,
  };
}

async function main() {
  if (process.env.VERCEL || process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production") {
    throw new Error("Off-site recovery verification is forbidden in deployed/Production runtime.");
  }
  const options = parseArgs(process.argv.slice(2));
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(options.manifestPath, "utf8"));
  } catch {
    throw new Error("Backup manifest could not be read as JSON.");
  }
  const assessment = assessBackupManifest(raw, {
    environment: "PRODUCTION",
    projectRef: PRODUCTION_PROJECT_REF,
    schema: PRODUCTION_SCHEMA,
  });
  if (!assessment.manifest || assessment.status === "INVALID") {
    throw new Error(`Backup manifest is INVALID: ${assessment.findings.join("; ")}`);
  }

  const manifest = assessment.manifest;
  const copied = await stat(options.copyPath);
  if (!copied.isFile()) throw new Error("Off-site copy must resolve to a regular file.");
  if (copied.size !== manifest.database.bytes) throw new Error("Off-site copy size does not match the source manifest.");
  const actualSha = await sha256File(options.copyPath);
  if (actualSha !== manifest.database.sha256) throw new Error("Off-site copy SHA-256 does not match the source manifest.");

  const key = backupKeyFromEnvironment(process.env.DR_BACKUP_KEY_BASE64);
  try {
    await verifyEncryptedFileAes256Gcm(options.copyPath, key);
  } finally {
    key.fill(0);
  }

  const evidence: OffsiteEvidence = {
    version: 1,
    kind: "ESSAFARIA_DR_OFFSITE_COPY",
    backupId: manifest.backupId,
    sourceManifestSha256: await sha256File(options.manifestPath),
    verifiedAt: new Date().toISOString(),
    locationRef: options.locationRef,
    databaseBytes: copied.size,
    databaseSha256: actualSha,
    encryptedAuthenticationVerified: true,
  };
  await writeFile(options.evidenceOutput, JSON.stringify(evidence, null, 2) + "\n", {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
  const evidenceSha256 = await sha256File(options.evidenceOutput);
  console.log(JSON.stringify({
    status: "PASS",
    backupId: manifest.backupId,
    locationRef: options.locationRef,
    evidenceSha256,
    evidenceRef: `OFFSITE-${evidenceSha256}`,
    byteIdentityVerified: true,
    encryptedAuthenticationVerified: true,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Off-site copy verification failed safely.");
  process.exitCode = 1;
});
