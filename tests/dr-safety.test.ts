import { describe, expect, it } from "vitest";
import {
  PRODUCTION_PROJECT_REF,
  PRODUCTION_SCHEMA,
  assessBackupManifest,
  assessRestoreTarget,
  reconcileStorageSnapshot,
  reconcileWalletSnapshot,
  type BackupManifest,
} from "../scripts/lib/dr-safety";

function verifiedManifest(): BackupManifest {
  return {
    version: 1,
    backupId: "ESSAFARIA-PROD-20261003T180000Z-0001",
    createdAt: "2026-10-03T18:00:00.000Z",
    source: {
      environment: "PRODUCTION",
      projectRef: PRODUCTION_PROJECT_REF,
      schema: PRODUCTION_SCHEMA,
      releaseSha: "53dc61de334c6412c1e5337b4f745c360f69facd",
      migrationLedger: ["0018_session_presence.sql", "0019_config_translations.sql"],
    },
    database: {
      artifact: "essafaria-prod-db-20261003T180000Z.dump.enc",
      bytes: 123456,
      sha256: "a".repeat(64),
      encrypted: true,
    },
    storage: {
      mode: "DATABASE_BLOBS",
      objectCount: 13,
      totalBytes: 654321,
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
      offsiteCopyVerified: true,
      verifiedAt: "2026-10-03T18:05:00.000Z",
      restoreTestedAt: "2026-10-03T18:30:00.000Z",
      restoreEnvironment: "RESTORE_TEST_LOCAL",
      restoredApplicationChecksPassed: true,
      walletReconciliationPassed: true,
      storageReconciliationPassed: true,
      tenantIsolationPassed: true,
    },
  };
}

describe("DR backup manifest", () => {
  it("classifies a complete encrypted and isolated-restore-tested manifest as VERIFIED", () => {
    const result = assessBackupManifest(verifiedManifest(), {
      environment: "PRODUCTION",
      projectRef: PRODUCTION_PROJECT_REF,
      schema: PRODUCTION_SCHEMA,
    });
    expect(result.status).toBe("VERIFIED");
    expect(result.findings).toEqual([]);
  });

  it("does not call a merely-created archive VERIFIED", () => {
    const manifest = verifiedManifest();
    manifest.verification.restoreTestedAt = null;
    manifest.verification.restoreEnvironment = null;
    manifest.verification.walletReconciliationPassed = false;
    const result = assessBackupManifest(manifest, {
      environment: "PRODUCTION",
      projectRef: PRODUCTION_PROJECT_REF,
      schema: PRODUCTION_SCHEMA,
    });
    expect(result.status).toBe("CREATED");
    expect(result.findings.join(" ")).toContain("has not satisfied");
  });

  it("rejects wrong-source, unencrypted and malformed manifests", () => {
    const wrongSource = verifiedManifest();
    wrongSource.source.projectRef = "ridoyedqgiavgcwnpubq";
    expect(assessBackupManifest(wrongSource, {
      environment: "PRODUCTION",
      projectRef: PRODUCTION_PROJECT_REF,
      schema: PRODUCTION_SCHEMA,
    })).toMatchObject({ status: "INVALID" });

    const unencrypted = verifiedManifest();
    unencrypted.database.encrypted = false;
    expect(assessBackupManifest(unencrypted).findings).toContain("database backup is not marked encrypted");

    expect(assessBackupManifest({ version: 1 })).toMatchObject({ status: "INVALID" });
  });

  it("refuses a restore attestation that names Production as the restore environment", () => {
    const manifest = verifiedManifest();
    manifest.verification.restoreEnvironment = "PRODUCTION";
    expect(assessBackupManifest(manifest).status).toBe("CREATED");
  });
});

describe("DR restore target guard", () => {
  it("allows only an explicitly declared local restore-test database", () => {
    expect(assessRestoreTarget({
      DR_ENVIRONMENT: "RESTORE_TEST",
      DATABASE_SCHEMA: "visa_os_restore_test",
      DATABASE_URL: "postgresql://restore:secret@127.0.0.1:5434/restore_test",
    })).toEqual({
      safe: true,
      findings: [],
      schema: "visa_os_restore_test",
      mode: "LOCAL",
    });
  });

  it("fails closed on missing explicit identity or deployed runtime", () => {
    expect(assessRestoreTarget({
      DATABASE_SCHEMA: "visa_os_restore_test",
      DATABASE_URL: "postgresql://restore:secret@127.0.0.1:5434/restore_test",
    }).safe).toBe(false);

    const deployed = assessRestoreTarget({
      DR_ENVIRONMENT: "RESTORE_TEST",
      DATABASE_SCHEMA: "visa_os_restore_test",
      DATABASE_URL: "postgresql://restore:secret@127.0.0.1:5434/restore_test",
      VERCEL_ENV: "production",
    });
    expect(deployed.safe).toBe(false);
    expect(deployed.findings.join(" ")).toContain("forbidden");
  });

  it("refuses remote targets unless explicitly disposable and never accepts the Production project", () => {
    const prodUrl = "postgresql://postgres.xgetzgixalrsmuvfthpf:secret@aws-1-us-east-1.pooler.supabase.com:6543/postgres";
    const noOptIn = assessRestoreTarget({
      DR_ENVIRONMENT: "RESTORE_TEST",
      DATABASE_SCHEMA: "visa_os_restore_test",
      DATABASE_URL: prodUrl,
    });
    expect(noOptIn.safe).toBe(false);
    expect(noOptIn.findings.join(" ")).toContain("DR_ALLOW_REMOTE_DISPOSABLE");

    const prodExplicit = assessRestoreTarget({
      DR_ENVIRONMENT: "RESTORE_TEST",
      DR_ALLOW_REMOTE_DISPOSABLE: "true",
      DR_DISPOSABLE_PROJECT_REF: PRODUCTION_PROJECT_REF,
      DATABASE_SCHEMA: "visa_os_restore_test",
      DATABASE_URL: prodUrl,
    });
    expect(prodExplicit.safe).toBe(false);
    expect(prodExplicit.findings.join(" ")).toContain("Production Supabase project");
  });
});

describe("wallet disaster-recovery reconciliation", () => {
  const agencies = [{ id: "agency-a", balance: "1250.00" }];
  const ledger = [
    {
      id: "tx-1",
      reference: "WLT-2026-000001",
      agencyId: "agency-a",
      applicationId: null,
      type: "CREDIT",
      amount: "1500.00",
      balanceBefore: "0.00",
      balanceAfter: "1500.00",
      createdAt: "2026-10-03T10:00:00.000Z",
    },
    {
      id: "tx-2",
      reference: "WLT-2026-000002",
      agencyId: "agency-a",
      applicationId: "app-1",
      type: "APPLICATION_CHARGE",
      amount: "250.00",
      balanceBefore: "1500.00",
      balanceAfter: "1250.00",
      createdAt: "2026-10-03T10:01:00.000Z",
    },
  ];

  it("accepts a continuous immutable ledger whose tail equals the current balance", () => {
    expect(reconcileWalletSnapshot(agencies, ledger, []).ok).toBe(true);
  });

  it("detects arithmetic, chain and current-balance corruption", () => {
    const broken = ledger.map((row) => ({ ...row }));
    broken[1]!.balanceBefore = "1400.00";
    broken[1]!.balanceAfter = "1150.00";
    const result = reconcileWalletSnapshot(agencies, broken, []);
    expect(result.ok).toBe(false);
    expect(result.findings.some((finding) => finding.includes("ledger chain breaks"))).toBe(true);
    expect(result.findings.some((finding) => finding.includes("current balance differs"))).toBe(true);
  });

  it("detects duplicate application charges and duplicate human references", () => {
    const duplicate = {
      ...ledger[1]!,
      id: "tx-3",
      balanceBefore: "1250.00",
      balanceAfter: "1000.00",
    };
    const result = reconcileWalletSnapshot([{ id: "agency-a", balance: "1000.00" }], [...ledger, duplicate], []);
    expect(result.ok).toBe(false);
    expect(result.findings.some((finding) => finding.includes("duplicate wallet reference"))).toBe(true);
    expect(result.findings.some((finding) => finding.includes("more than one APPLICATION_CHARGE"))).toBe(true);
  });

  it("detects processed top-ups without their linked credit evidence", () => {
    const result = reconcileWalletSnapshot(agencies, ledger, [{
      id: "top-1",
      reference: "TOP-2026-000001",
      agencyId: "agency-a",
      status: "PROCESSED",
      walletTransactionId: "missing-tx",
    }]);
    expect(result.ok).toBe(false);
    expect(result.findings.join(" ")).toContain("no existing linked wallet transaction");
  });
});

describe("database/storage disaster-recovery reconciliation", () => {
  it("accepts matching references and object inventory", () => {
    const result = reconcileStorageSnapshot(
      [
        { id: "doc-1", kind: "DOSSIER_DOCUMENT", key: "visa-documents/app-1/doc-1", expectedSizeBytes: 100 },
        { id: "top-1", kind: "TOPUP_RECEIPT", key: "topup-proofs/a/t/r.pdf", expectedSizeBytes: 50 },
      ],
      [
        { key: "visa-documents/app-1/doc-1", sizeBytes: 100 },
        { key: "topup-proofs/a/t/r.pdf", sizeBytes: 50 },
      ],
    );
    expect(result).toMatchObject({ ok: true, missingObjects: 0, orphanObjects: 0 });
  });

  it("raises a critical finding for missing official decision or receipt evidence", () => {
    const result = reconcileStorageSnapshot(
      [{ id: "decision-1", kind: "OFFICIAL_DECISION", key: "visa-documents/app-1/decision-1", expectedSizeBytes: 42 }],
      [],
    );
    expect(result.ok).toBe(false);
    expect(result.findings).toContain("CRITICAL_DOCUMENT_MISSING: OFFICIAL_DECISION decision-1");
  });

  it("detects size/version mismatch and orphan objects without inventing recovery", () => {
    const result = reconcileStorageSnapshot(
      [{ id: "doc-1", kind: "DOSSIER_DOCUMENT", key: "k1", expectedSizeBytes: 100 }],
      [{ key: "k1", sizeBytes: 90 }, { key: "orphan", sizeBytes: 20 }],
    );
    expect(result.ok).toBe(false);
    expect(result.findings.some((finding) => finding.includes("VERSION_OR_SIZE_MISMATCH"))).toBe(true);
    expect(result.findings).toContain("ORPHAN_BLOB: orphan");
  });
});
