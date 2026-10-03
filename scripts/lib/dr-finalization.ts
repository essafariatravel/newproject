import {
  PRODUCTION_PROJECT_REF,
  PRODUCTION_SCHEMA,
  assessBackupManifest,
  type BackupManifest,
} from "./dr-safety";

const SHA256 = /^[0-9a-f]{64}$/;
const EVIDENCE_REF = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/;

export interface RestoreEvidence {
  version: 1;
  kind: "ESSAFARIA_DR_RESTORE";
  backupId: string;
  sourceManifestSha256: string;
  restoredAt: string;
  target: {
    mode: "LOCAL" | "REMOTE_DISPOSABLE";
    schema: string;
    projectRef: string | null;
  };
  databaseVerificationPassed: boolean;
  walletReconciliationPassed: boolean;
  storageReconciliationPassed: boolean;
}

export interface ExternalEvidenceRefs {
  offsite: string;
  application: string;
  tenantIsolation: string;
}

export interface FinalizationInput {
  manifest: BackupManifest;
  sourceManifestSha256: string;
  restoreEvidence: RestoreEvidence;
  restoreEvidenceSha256: string;
  evidence: ExternalEvidenceRefs;
  externalEvidenceAttested: boolean;
  verifiedAt?: Date;
}

function validIso(value: string): boolean {
  return !Number.isNaN(Date.parse(value)) && /^\d{4}-\d{2}-\d{2}T/.test(value);
}

export function validateRestoreEvidence(
  evidence: RestoreEvidence,
  manifest: BackupManifest,
  sourceManifestSha256: string,
): string[] {
  const findings: string[] = [];
  if (evidence.version !== 1 || evidence.kind !== "ESSAFARIA_DR_RESTORE") findings.push("restore evidence format is invalid");
  if (evidence.backupId !== manifest.backupId) findings.push("restore evidence backupId does not match manifest");
  if (!SHA256.test(evidence.sourceManifestSha256) || evidence.sourceManifestSha256 !== sourceManifestSha256) {
    findings.push("restore evidence is not bound to this source manifest");
  }
  if (!validIso(evidence.restoredAt)) findings.push("restore evidence timestamp is invalid");
  if (!["LOCAL", "REMOTE_DISPOSABLE"].includes(evidence.target?.mode)) findings.push("restore evidence target mode is invalid");
  if (evidence.target?.schema !== manifest.source.schema) findings.push("restore evidence schema does not match backup schema");
  if (evidence.target?.projectRef === PRODUCTION_PROJECT_REF) findings.push("restore evidence points to the Production project");
  if (evidence.target?.mode === "REMOTE_DISPOSABLE" && !evidence.target.projectRef) {
    findings.push("remote restore evidence requires a disposable project ref");
  }
  if (evidence.target?.mode === "LOCAL" && evidence.target.projectRef !== null) {
    findings.push("local restore evidence must not claim a remote project ref");
  }
  if (!evidence.databaseVerificationPassed) findings.push("restore database verification did not pass");
  if (!evidence.walletReconciliationPassed) findings.push("restore wallet reconciliation did not pass");
  if (!evidence.storageReconciliationPassed) findings.push("restore storage reconciliation did not pass");
  return findings;
}

function validateExternalRef(label: string, value: string): string | null {
  return EVIDENCE_REF.test(value) ? null : `${label} evidence reference must be an opaque 8-160 character identifier`;
}

export function finalizeBackupManifest(input: FinalizationInput): {
  manifest: BackupManifest | null;
  findings: string[];
} {
  const findings: string[] = [];
  const sourceAssessment = assessBackupManifest(input.manifest, {
    environment: "PRODUCTION",
    projectRef: PRODUCTION_PROJECT_REF,
    schema: PRODUCTION_SCHEMA,
  });
  if (sourceAssessment.status === "INVALID" || !sourceAssessment.manifest) {
    findings.push(...sourceAssessment.findings.map((finding) => `source manifest: ${finding}`));
    return { manifest: null, findings };
  }
  if (sourceAssessment.status === "VERIFIED") {
    findings.push("source manifest is already VERIFIED; finalization must be idempotently archived rather than rewritten");
    return { manifest: null, findings };
  }
  if (!SHA256.test(input.sourceManifestSha256)) findings.push("source manifest SHA-256 is invalid");
  if (!SHA256.test(input.restoreEvidenceSha256)) findings.push("restore evidence SHA-256 is invalid");
  findings.push(...validateRestoreEvidence(input.restoreEvidence, sourceAssessment.manifest, input.sourceManifestSha256));

  const refs = [
    ["off-site", input.evidence.offsite],
    ["application", input.evidence.application],
    ["tenant-isolation", input.evidence.tenantIsolation],
  ] as const;
  for (const [label, value] of refs) {
    const finding = validateExternalRef(label, value);
    if (finding) findings.push(finding);
  }
  if (!input.externalEvidenceAttested) {
    findings.push("external evidence review must be explicitly attested; repository tooling cannot invent off-site/application/tenant proof");
  }
  const restoredAt = Date.parse(input.restoreEvidence.restoredAt);
  const verifiedAt = input.verifiedAt ?? new Date();
  if (Number.isNaN(restoredAt) || verifiedAt.getTime() < restoredAt) {
    findings.push("final verification cannot predate the isolated restore");
  }
  if (findings.length) return { manifest: null, findings };

  const source = sourceAssessment.manifest;
  const finalized: BackupManifest = {
    ...source,
    source: { ...source.source, migrationLedger: [...source.source.migrationLedger] },
    database: {
      ...source.database,
      rowCounts: { ...source.database.rowCounts },
      sequences: [...source.database.sequences],
    },
    storage: { ...source.storage },
    verification: {
      ...source.verification,
      offsiteCopyVerified: true,
      verifiedAt: verifiedAt.toISOString(),
      restoreTestedAt: input.restoreEvidence.restoredAt,
      restoreEnvironment: `${input.restoreEvidence.target.mode}:${input.restoreEvidence.target.schema}`,
      restoredApplicationChecksPassed: true,
      walletReconciliationPassed: true,
      storageReconciliationPassed: true,
      tenantIsolationPassed: true,
      restoreEvidenceSha256: input.restoreEvidenceSha256,
      offsiteEvidenceRef: input.evidence.offsite,
      applicationEvidenceRef: input.evidence.application,
      tenantIsolationEvidenceRef: input.evidence.tenantIsolation,
    },
  };

  const finalAssessment = assessBackupManifest(finalized, {
    environment: "PRODUCTION",
    projectRef: PRODUCTION_PROJECT_REF,
    schema: PRODUCTION_SCHEMA,
  });
  if (finalAssessment.status !== "VERIFIED" || !finalAssessment.manifest) {
    return {
      manifest: null,
      findings: finalAssessment.findings.length
        ? finalAssessment.findings
        : ["final manifest did not satisfy VERIFIED contract"],
    };
  }
  return { manifest: finalAssessment.manifest, findings: [] };
}
