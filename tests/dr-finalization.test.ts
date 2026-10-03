import { describe, expect, it } from "vitest";
import {
  DR_CRITICAL_TABLES,
  PRODUCTION_PROJECT_REF,
  PRODUCTION_SCHEMA,
  assessBackupManifest,
  type BackupManifest,
} from "../scripts/lib/dr-safety";
import {
  finalizeBackupManifest,
  type RestoreEvidence,
  type OffsiteEvidence,
  type ApplicationRecoveryEvidence,
  type TenantIsolationEvidence,
} from "../scripts/lib/dr-finalization";

function createdManifest(): BackupManifest {
  return {
    version: 1,
    backupId: "ESSAFARIA-PROD-20261003T180000Z-abcdef123456",
    createdAt: "2026-10-03T18:00:00.000Z",
    source: {
      environment: "PRODUCTION",
      projectRef: PRODUCTION_PROJECT_REF,
      schema: PRODUCTION_SCHEMA,
      releaseSha: "abcdef1234567890abcdef1234567890abcdef12",
      migrationLedger: ["0001_init.sql", "0019_config_translations.sql"],
    },
    database: {
      artifact: "ESSAFARIA-PROD-20261003T180000Z-abcdef123456.dump.enc",
      bytes: 1000,
      sha256: "a".repeat(64),
      encrypted: true,
      rowCounts: Object.fromEntries(DR_CRITICAL_TABLES.map((name) => [name, name === "wallet_transactions" ? 2 : 1])),
      sequences: ["wallet_reference_seq"],
    },
    storage: {
      mode: "DATABASE_BLOBS",
      objectCount: 8,
      totalBytes: 1000,
      manifestSha256: "b".repeat(64),
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
}

function restoreEvidence(): RestoreEvidence {
  return {
    version: 1,
    kind: "ESSAFARIA_DR_RESTORE",
    backupId: "ESSAFARIA-PROD-20261003T180000Z-abcdef123456",
    sourceManifestSha256: "c".repeat(64),
    restoredAt: "2026-10-03T18:30:00.000Z",
    target: {
      mode: "LOCAL",
      schema: PRODUCTION_SCHEMA,
      projectRef: null,
    },
    databaseVerificationPassed: true,
    walletReconciliationPassed: true,
    storageReconciliationPassed: true,
  };
}

function offsiteEvidence(): OffsiteEvidence {
  return {
    version: 1,
    kind: "ESSAFARIA_DR_OFFSITE_COPY",
    backupId: "ESSAFARIA-PROD-20261003T180000Z-abcdef123456",
    sourceManifestSha256: "c".repeat(64),
    verifiedAt: "2026-10-03T18:32:00.000Z",
    locationRef: "OFFSITE-VAULT-0001",
    databaseBytes: 1000,
    databaseSha256: "a".repeat(64),
    encryptedAuthenticationVerified: true,
  };
}

function applicationEvidence(): ApplicationRecoveryEvidence {
  return {
    version: 1,
    kind: "ESSAFARIA_DR_APPLICATION",
    backupId: "ESSAFARIA-PROD-20261003T180000Z-abcdef123456",
    releaseSha: "abcdef1234567890abcdef1234567890abcdef12",
    restoreEvidenceSha256: "d".repeat(64),
    testedAt: "2026-10-03T18:33:00.000Z",
    targetRef: "RESTORE-APP-0001",
    checks: {
      healthReachable: true,
      staffLogin: true,
      agencyLogin: true,
      staffCriticalRead: true,
      agencyOwnApplicationRead: true,
      agencyOwnDocumentRead: true,
      walletRead: true,
    },
  };
}

function tenantEvidence(): TenantIsolationEvidence {
  return {
    version: 1,
    kind: "ESSAFARIA_DR_TENANT_ISOLATION",
    backupId: "ESSAFARIA-PROD-20261003T180000Z-abcdef123456",
    releaseSha: "abcdef1234567890abcdef1234567890abcdef12",
    restoreEvidenceSha256: "d".repeat(64),
    testedAt: "2026-10-03T18:34:00.000Z",
    targetRef: "RESTORE-TENANT-0001",
    checks: {
      foreignApplicationDenied: true,
      foreignDocumentDenied: true,
      foreignApplicantDenied: true,
      foreignWalletDataNotVisible: true,
      forgedForeignUploadDenied: true,
    },
  };
}

describe("DR evidence-bound finalization", () => {
  it("promotes a CREATED backup only when restore and external evidence are explicitly bound", () => {
    const result = finalizeBackupManifest({
      manifest: createdManifest(),
      sourceManifestSha256: "c".repeat(64),
      restoreEvidence: restoreEvidence(),
      restoreEvidenceSha256: "d".repeat(64),
      offsiteEvidence: offsiteEvidence(),
      offsiteEvidenceSha256: "e".repeat(64),
      applicationEvidence: applicationEvidence(),
      applicationEvidenceSha256: "f".repeat(64),
      tenantIsolationEvidence: tenantEvidence(),
      tenantIsolationEvidenceSha256: "1".repeat(64),
      externalEvidenceAttested: true,
      verifiedAt: new Date("2026-10-03T18:35:00.000Z"),
    });
    expect(result.findings).toEqual([]);
    expect(result.manifest).not.toBeNull();
    expect(assessBackupManifest(result.manifest!).status).toBe("VERIFIED");
    expect(result.manifest!.verification.restoreEvidenceSha256).toBe("d".repeat(64));
  });

  it("refuses to convert booleans into proof when external evidence was not explicitly attested", () => {
    const result = finalizeBackupManifest({
      manifest: createdManifest(),
      sourceManifestSha256: "c".repeat(64),
      restoreEvidence: restoreEvidence(),
      restoreEvidenceSha256: "d".repeat(64),
      offsiteEvidence: offsiteEvidence(),
      offsiteEvidenceSha256: "e".repeat(64),
      applicationEvidence: applicationEvidence(),
      applicationEvidenceSha256: "f".repeat(64),
      tenantIsolationEvidence: tenantEvidence(),
      tenantIsolationEvidenceSha256: "1".repeat(64),
      externalEvidenceAttested: false,
      verifiedAt: new Date("2026-10-03T18:35:00.000Z"),
    });
    expect(result.manifest).toBeNull();
    expect(result.findings.join(" ")).toContain("explicitly attested");
  });

  it("refuses restore evidence that is not bound to the exact source manifest", () => {
    const evidence = restoreEvidence();
    evidence.sourceManifestSha256 = "e".repeat(64);
    const result = finalizeBackupManifest({
      manifest: createdManifest(),
      sourceManifestSha256: "c".repeat(64),
      restoreEvidence: evidence,
      restoreEvidenceSha256: "d".repeat(64),
      offsiteEvidence: offsiteEvidence(),
      offsiteEvidenceSha256: "e".repeat(64),
      applicationEvidence: applicationEvidence(),
      applicationEvidenceSha256: "f".repeat(64),
      tenantIsolationEvidence: tenantEvidence(),
      tenantIsolationEvidenceSha256: "1".repeat(64),
      externalEvidenceAttested: true,
      verifiedAt: new Date("2026-10-03T18:35:00.000Z"),
    });
    expect(result.manifest).toBeNull();
    expect(result.findings.join(" ")).toContain("not bound to this source manifest");
  });

  it("refuses application evidence from a different code release", () => {
    const application = applicationEvidence();
    application.releaseSha = "1111111111111111111111111111111111111111";
    const result = finalizeBackupManifest({
      manifest: createdManifest(),
      sourceManifestSha256: "c".repeat(64),
      restoreEvidence: restoreEvidence(),
      restoreEvidenceSha256: "d".repeat(64),
      offsiteEvidence: offsiteEvidence(),
      offsiteEvidenceSha256: "e".repeat(64),
      applicationEvidence: application,
      applicationEvidenceSha256: "f".repeat(64),
      tenantIsolationEvidence: tenantEvidence(),
      tenantIsolationEvidenceSha256: "1".repeat(64),
      externalEvidenceAttested: true,
      verifiedAt: new Date("2026-10-03T18:35:00.000Z"),
    });
    expect(result.manifest).toBeNull();
    expect(result.findings.join(" ")).toContain("releaseSha does not match");
  });

  it("refuses application evidence when a required recovery check failed", () => {
    const application = applicationEvidence();
    application.checks.agencyOwnDocumentRead = false;
    const result = finalizeBackupManifest({
      manifest: createdManifest(),
      sourceManifestSha256: "c".repeat(64),
      restoreEvidence: restoreEvidence(),
      restoreEvidenceSha256: "d".repeat(64),
      offsiteEvidence: offsiteEvidence(),
      offsiteEvidenceSha256: "e".repeat(64),
      applicationEvidence: application,
      applicationEvidenceSha256: "f".repeat(64),
      tenantIsolationEvidence: tenantEvidence(),
      tenantIsolationEvidenceSha256: "1".repeat(64),
      externalEvidenceAttested: true,
      verifiedAt: new Date("2026-10-03T18:35:00.000Z"),
    });
    expect(result.manifest).toBeNull();
    expect(result.findings.join(" ")).toContain("agencyOwnDocumentRead");
  });

  it("refuses tenant evidence when foreign access was not demonstrably denied", () => {
    const tenant = tenantEvidence();
    tenant.checks.foreignDocumentDenied = false;
    const result = finalizeBackupManifest({
      manifest: createdManifest(),
      sourceManifestSha256: "c".repeat(64),
      restoreEvidence: restoreEvidence(),
      restoreEvidenceSha256: "d".repeat(64),
      offsiteEvidence: offsiteEvidence(),
      offsiteEvidenceSha256: "e".repeat(64),
      applicationEvidence: applicationEvidence(),
      applicationEvidenceSha256: "f".repeat(64),
      tenantIsolationEvidence: tenant,
      tenantIsolationEvidenceSha256: "1".repeat(64),
      externalEvidenceAttested: true,
      verifiedAt: new Date("2026-10-03T18:35:00.000Z"),
    });
    expect(result.manifest).toBeNull();
    expect(result.findings.join(" ")).toContain("foreignDocumentDenied");
  });

  it("refuses off-site evidence that is not byte-identical to the backup", () => {
    const offsite = offsiteEvidence();
    offsite.databaseSha256 = "f".repeat(64);
    const result = finalizeBackupManifest({
      manifest: createdManifest(),
      sourceManifestSha256: "c".repeat(64),
      restoreEvidence: restoreEvidence(),
      restoreEvidenceSha256: "d".repeat(64),
      offsiteEvidence: offsite,
      offsiteEvidenceSha256: "e".repeat(64),
      applicationEvidence: applicationEvidence(),
      applicationEvidenceSha256: "f".repeat(64),
      tenantIsolationEvidence: tenantEvidence(),
      tenantIsolationEvidenceSha256: "1".repeat(64),
      externalEvidenceAttested: true,
      verifiedAt: new Date("2026-10-03T18:35:00.000Z"),
    });
    expect(result.manifest).toBeNull();
    expect(result.findings.join(" ")).toContain("database SHA-256 does not match manifest");
  });

  it("refuses evidence references that look like free-form text or paths", () => {
    const result = finalizeBackupManifest({
      manifest: createdManifest(),
      sourceManifestSha256: "c".repeat(64),
      restoreEvidence: restoreEvidence(),
      restoreEvidenceSha256: "d".repeat(64),
      offsiteEvidence: offsiteEvidence(),
      offsiteEvidenceSha256: "e".repeat(64),
      applicationEvidence: { ...applicationEvidence(), targetRef: "bad path" },
      applicationEvidenceSha256: "f".repeat(64),
      tenantIsolationEvidence: { ...tenantEvidence(), targetRef: "/tmp/tenant-evidence.txt" },
      tenantIsolationEvidenceSha256: "1".repeat(64),
      externalEvidenceAttested: true,
      verifiedAt: new Date("2026-10-03T18:35:00.000Z"),
    });
    expect(result.manifest).toBeNull();
    expect(result.findings.length).toBeGreaterThan(0);
  });
});
