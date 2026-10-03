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

export interface OffsiteEvidence {
  version: 1;
  kind: "ESSAFARIA_DR_OFFSITE_COPY";
  backupId: string;
  sourceManifestSha256: string;
  verifiedAt: string;
  locationRef: string;
  databaseBytes: number;
  databaseSha256: string;
  encryptedAuthenticationVerified: boolean;
}

export interface ApplicationRecoveryEvidence {
  version: 1;
  kind: "ESSAFARIA_DR_APPLICATION";
  backupId: string;
  releaseSha: string;
  restoreEvidenceSha256: string;
  testedAt: string;
  targetRef: string;
  checks: {
    healthReachable: boolean;
    staffLogin: boolean;
    agencyLogin: boolean;
    staffCriticalRead: boolean;
    agencyOwnApplicationRead: boolean;
    agencyOwnDocumentRead: boolean;
    walletRead: boolean;
  };
}

export interface TenantIsolationEvidence {
  version: 1;
  kind: "ESSAFARIA_DR_TENANT_ISOLATION";
  backupId: string;
  releaseSha: string;
  restoreEvidenceSha256: string;
  testedAt: string;
  targetRef: string;
  checks: {
    foreignApplicationDenied: boolean;
    foreignDocumentDenied: boolean;
    foreignApplicantDenied: boolean;
    foreignWalletDataNotVisible: boolean;
    forgedForeignUploadDenied: boolean;
  };
}

export interface FinalizationInput {
  manifest: BackupManifest;
  sourceManifestSha256: string;
  restoreEvidence: RestoreEvidence;
  restoreEvidenceSha256: string;
  offsiteEvidence: OffsiteEvidence;
  offsiteEvidenceSha256: string;
  applicationEvidence: ApplicationRecoveryEvidence;
  applicationEvidenceSha256: string;
  tenantIsolationEvidence: TenantIsolationEvidence;
  tenantIsolationEvidenceSha256: string;
  externalEvidenceAttested: boolean;
  verifiedAt?: Date;
}

function validIso(value: string): boolean {
  return !Number.isNaN(Date.parse(value)) && /^\d{4}-\d{2}-\d{2}T/.test(value);
}

export function validateOffsiteEvidence(
  evidence: OffsiteEvidence,
  manifest: BackupManifest,
  sourceManifestSha256: string,
): string[] {
  const findings: string[] = [];
  if (evidence.version !== 1 || evidence.kind !== "ESSAFARIA_DR_OFFSITE_COPY") findings.push("off-site evidence format is invalid");
  if (evidence.backupId !== manifest.backupId) findings.push("off-site evidence backupId does not match manifest");
  if (!SHA256.test(evidence.sourceManifestSha256) || evidence.sourceManifestSha256 !== sourceManifestSha256) {
    findings.push("off-site evidence is not bound to this source manifest");
  }
  if (!validIso(evidence.verifiedAt)) findings.push("off-site evidence timestamp is invalid");
  if (!EVIDENCE_REF.test(evidence.locationRef)) findings.push("off-site evidence locationRef is invalid");
  if (!Number.isSafeInteger(evidence.databaseBytes) || evidence.databaseBytes <= 0 ||
      evidence.databaseBytes !== manifest.database.bytes) {
    findings.push("off-site evidence byte size does not match manifest");
  }
  if (!SHA256.test(evidence.databaseSha256) || evidence.databaseSha256 !== manifest.database.sha256) {
    findings.push("off-site evidence database SHA-256 does not match manifest");
  }
  if (evidence.encryptedAuthenticationVerified !== true) {
    findings.push("off-site evidence does not prove encrypted archive authentication");
  }
  const createdAt = Date.parse(manifest.createdAt);
  const verifiedAt = Date.parse(evidence.verifiedAt);
  if (!Number.isNaN(verifiedAt) && verifiedAt < createdAt) {
    findings.push("off-site verification timestamp predates backup creation");
  }
  return findings;
}

export function validateApplicationEvidence(
  evidence: ApplicationRecoveryEvidence,
  manifest: BackupManifest,
  restoreEvidenceSha256: string,
  restoredAt: string,
): string[] {
  const findings: string[] = [];
  if (evidence.version !== 1 || evidence.kind !== "ESSAFARIA_DR_APPLICATION") findings.push("application evidence format is invalid");
  if (evidence.backupId !== manifest.backupId) findings.push("application evidence backupId does not match manifest");
  if (evidence.releaseSha !== manifest.source.releaseSha) findings.push("application evidence releaseSha does not match backup release");
  if (!SHA256.test(evidence.restoreEvidenceSha256) || evidence.restoreEvidenceSha256 !== restoreEvidenceSha256) {
    findings.push("application evidence is not bound to the exact restore evidence");
  }
  if (!validIso(evidence.testedAt)) findings.push("application evidence timestamp is invalid");
  if (!EVIDENCE_REF.test(evidence.targetRef)) findings.push("application evidence targetRef is invalid");
  const required = [
    "healthReachable",
    "staffLogin",
    "agencyLogin",
    "staffCriticalRead",
    "agencyOwnApplicationRead",
    "agencyOwnDocumentRead",
    "walletRead",
  ] as const;
  for (const key of required) {
    if (evidence.checks?.[key] !== true) findings.push(`application recovery check failed: ${key}`);
  }
  const testedAt = Date.parse(evidence.testedAt);
  const restoreAt = Date.parse(restoredAt);
  if (!Number.isNaN(testedAt) && !Number.isNaN(restoreAt) && testedAt < restoreAt) {
    findings.push("application evidence timestamp predates isolated restore");
  }
  return findings;
}

export function validateTenantIsolationEvidence(
  evidence: TenantIsolationEvidence,
  manifest: BackupManifest,
  restoreEvidenceSha256: string,
  restoredAt: string,
): string[] {
  const findings: string[] = [];
  if (evidence.version !== 1 || evidence.kind !== "ESSAFARIA_DR_TENANT_ISOLATION") findings.push("tenant-isolation evidence format is invalid");
  if (evidence.backupId !== manifest.backupId) findings.push("tenant-isolation evidence backupId does not match manifest");
  if (evidence.releaseSha !== manifest.source.releaseSha) findings.push("tenant-isolation evidence releaseSha does not match backup release");
  if (!SHA256.test(evidence.restoreEvidenceSha256) || evidence.restoreEvidenceSha256 !== restoreEvidenceSha256) {
    findings.push("tenant-isolation evidence is not bound to the exact restore evidence");
  }
  if (!validIso(evidence.testedAt)) findings.push("tenant-isolation evidence timestamp is invalid");
  if (!EVIDENCE_REF.test(evidence.targetRef)) findings.push("tenant-isolation evidence targetRef is invalid");
  const required = [
    "foreignApplicationDenied",
    "foreignDocumentDenied",
    "foreignApplicantDenied",
    "foreignWalletDataNotVisible",
    "forgedForeignUploadDenied",
  ] as const;
  for (const key of required) {
    if (evidence.checks?.[key] !== true) findings.push(`tenant-isolation recovery check failed: ${key}`);
  }
  const testedAt = Date.parse(evidence.testedAt);
  const restoreAt = Date.parse(restoredAt);
  if (!Number.isNaN(testedAt) && !Number.isNaN(restoreAt) && testedAt < restoreAt) {
    findings.push("tenant-isolation evidence timestamp predates isolated restore");
  }
  return findings;
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
  if (!SHA256.test(input.offsiteEvidenceSha256)) findings.push("off-site evidence SHA-256 is invalid");
  if (!SHA256.test(input.applicationEvidenceSha256)) findings.push("application evidence SHA-256 is invalid");
  if (!SHA256.test(input.tenantIsolationEvidenceSha256)) findings.push("tenant-isolation evidence SHA-256 is invalid");
  findings.push(...validateRestoreEvidence(input.restoreEvidence, sourceAssessment.manifest, input.sourceManifestSha256));
  findings.push(...validateOffsiteEvidence(input.offsiteEvidence, sourceAssessment.manifest, input.sourceManifestSha256));
  findings.push(...validateApplicationEvidence(
    input.applicationEvidence,
    sourceAssessment.manifest,
    input.restoreEvidenceSha256,
    input.restoreEvidence.restoredAt,
  ));
  findings.push(...validateTenantIsolationEvidence(
    input.tenantIsolationEvidence,
    sourceAssessment.manifest,
    input.restoreEvidenceSha256,
    input.restoreEvidence.restoredAt,
  ));
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
      offsiteEvidenceRef: `OFFSITE-${input.offsiteEvidenceSha256}`,
      applicationEvidenceRef: `APPLICATION-${input.applicationEvidenceSha256}`,
      tenantIsolationEvidenceRef: `TENANT-${input.tenantIsolationEvidenceSha256}`,
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
