/** Production release preflight guards for the verified post-release state through 0019. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  APPROVED_BASELINE,
  EXPECTED_SUPABASE_PROJECT,
  PRODUCTION_SCHEMA,
  PROJECT_USER,
  RELEASE_SCOPE,
  TARGET_LEDGER,
  isReadOnlyMode,
  ledgerEquals,
  pendingMigrations,
  preflightFindings,
  projectGuardFindings,
  releaseManifestFindings,
  type SnapshotReport,
} from "../scripts/prod-release";

function approvedSnapshot(): SnapshotReport {
  return {
    counts: { ...APPROVED_BASELINE.counts },
    walletChecksum: APPROVED_BASELINE.walletChecksum,
    agencyWallets: APPROVED_BASELINE.agencyWalletsChecksum,
    ledger: [...APPROVED_BASELINE.ledger],
    brand: { "brand.name": "ESSAFARIA TRAVEL" },
    statusMix: { APPROVED: 2 },
    remapExposure: {},
    columnsValid: true,
    schemaError: null,
    snapshotTables: [],
    guardNotes: [],
  };
}

describe("current Production release manifest", () => {
  it("keeps the approved Production ledger through 0019 and blocks the unapproved hardening migrations", () => {
    expect([...RELEASE_SCOPE]).toEqual([]);
    expect(APPROVED_BASELINE.ledger).toHaveLength(19);
    expect(APPROVED_BASELINE.ledger[18]).toBe("0019_config_translations.sql");
    expect(TARGET_LEDGER).toEqual([...APPROVED_BASELINE.ledger]);
    const pending = pendingMigrations(APPROVED_BASELINE.ledger);
    expect(pending).toEqual([
      "0020_identity_security.sql",
      "0021_business_invariants.sql",
      "0022_registration_review.sql",
      "0023_operations_legal.sql",
      "0024_preview_api_lockdown.sql",
      "0025_legal_privacy_readiness.sql",
      "0026_function_privilege_hardening.sql",
      "0027_document_integrity.sql",
      "0028_file_identity_hardening.sql",
      "0029_legacy_reconciliation.sql",
      "0030_reconciliation_api_lockdown.sql",
      "0031_reconciliation_event_sequence_repair.sql",
    ]);
    expect(preflightFindings(approvedSnapshot(), pending).some((finding) => finding.includes("pending migration set is not this release"))).toBe(true);
  });

  it("rejects the stale pre-release ledger ending at 0017", () => {
    const stale = approvedSnapshot();
    stale.ledger = stale.ledger.slice(0, 17);
    const findings = preflightFindings(stale, [
      "0018_session_presence.sql",
      "0019_config_translations.sql",
    ]);
    expect(findings.some((f) => f.startsWith("ledger differs:"))).toBe(true);
    expect(findings.some((f) => f.includes("pending migration set is not this release"))).toBe(true);
  });

  it("rejects any unexpected future migration", () => {
    const findings = releaseManifestFindings(["0020_future.sql"]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain("pending migration set is not this release");
  });
});

describe("baseline remains fail-closed", () => {
  it("does not silently accept protected-count, wallet, or balance drift", () => {
    const live = approvedSnapshot();
    live.counts.notifications = (APPROVED_BASELINE.counts.notifications ?? 0) + 2;
    live.counts.wallet_transactions = (APPROVED_BASELINE.counts.wallet_transactions ?? 0) + 1;
    live.walletChecksum = "candidate-wallet-checksum";
    live.agencyWallets = "candidate-agency-checksum";
    const findings = preflightFindings(live, []);
    expect(findings.some((f) => f.startsWith("notifications:"))).toBe(true);
    expect(findings.some((f) => f.startsWith("wallet_transactions:"))).toBe(true);
    expect(findings.some((f) => f.includes("wallet ledger checksum differs"))).toBe(true);
    expect(findings.some((f) => f.includes("agency balances checksum differs"))).toBe(true);
  });

  it("still allows audit_logs to grow but never shrink", () => {
    const grown = approvedSnapshot();
    grown.counts.audit_logs = (APPROVED_BASELINE.counts.audit_logs ?? 0) + 10;
    expect(preflightFindings(grown, [])).toEqual([]);

    const shrunk = approvedSnapshot();
    shrunk.counts.audit_logs = (APPROVED_BASELINE.counts.audit_logs ?? 0) - 1;
    expect(preflightFindings(shrunk, []).some((f) => f.startsWith("audit_logs="))).toBe(true);
  });
});

describe("read-only audit safety", () => {
  it("keeps audit and baseline-candidate read-only; apply is the only write-capable mode", () => {
    expect(isReadOnlyMode("audit")).toBe(true);
    expect(isReadOnlyMode("baseline-candidate")).toBe(true);
    expect(isReadOnlyMode("apply")).toBe(false);
    const source = readFileSync(path.join(process.cwd(), "scripts/prod-release.ts"), "utf8");
    expect(source).toContain('readOnly ? "begin read only" : "begin"');
    expect(source).toContain("CANDIDATE ONLY — NOT APPROVED");
  });
});

describe("Production target pinning", () => {
  it("hard-pins schema to visa_os", () => {
    expect(PRODUCTION_SCHEMA).toBe("visa_os");
  });

  it("hard-pins the approved Supabase project for pooler and direct URLs", () => {
    expect(EXPECTED_SUPABASE_PROJECT).toBe("xgetzgixalrsmuvfthpf");
    expect(PROJECT_USER).toBe("postgres.xgetzgixalrsmuvfthpf");
    expect(projectGuardFindings("postgresql://postgres.xgetzgixalrsmuvfthpf:pw@aws-1-us-east-1.pooler.supabase.com:6543/postgres")).toEqual([]);
    expect(projectGuardFindings("postgresql://postgres:pw@db.xgetzgixalrsmuvfthpf.supabase.co:5432/postgres")).toEqual([]);
    expect(projectGuardFindings("postgresql://postgres.ridoyedqgiavgcwnpubq:pw@aws-1-us-east-1.pooler.supabase.com:6543/postgres")).toHaveLength(1);
    expect(projectGuardFindings("postgresql://postgres:pw@db.ridoyedqgiavgcwnpubq.supabase.co:5432/postgres")).toHaveLength(1);
  });
});

describe("apply authorization remains push + PROD_GO only", () => {
  it("allows the RC branch but still requires push + PROD_GO + successful audit for apply", () => {
    const workflow = readFileSync(path.join(process.cwd(), ".github/workflows/prod-release.yml"), "utf8");
    const applySection = workflow.slice(workflow.indexOf("  apply:"));
    expect(workflow).toContain("- release/essafaria-rc-2026-09");
    expect(applySection).toContain("github.event_name == 'push'");
    expect(applySection).toContain("needs.audit.outputs.go == 'true'");
    expect(applySection).toContain("needs.audit.result == 'success'");
    expect(workflow).toContain("release/PROD_GO");
    expect(workflow).toContain("DATABASE_SCHEMA: visa_os");
  });

  it("cannot run apply without PROD_GO and workflow_dispatch never exposes apply", () => {
    const workflow = readFileSync(path.join(process.cwd(), ".github/workflows/prod-release.yml"), "utf8");
    const dispatchSection = workflow.slice(
      workflow.indexOf("  workflow_dispatch:"),
      workflow.indexOf("\n\nconcurrency:"),
    );
    const applySection = workflow.slice(workflow.indexOf("  apply:"));
    expect(dispatchSection).toContain("- audit");
    expect(dispatchSection).toContain("- baseline-candidate");
    expect(dispatchSection).not.toMatch(/\n\s*- apply(?:\n|$)/);
    expect(applySection).toContain("github.event_name == 'push'");
    expect(applySection).toContain("needs.audit.outputs.go == 'true'");
    expect(workflow).toContain("if [ -f release/PROD_GO ]");
  });
});

describe("ledger comparison", () => {
  it("is order- and length-sensitive", () => {
    expect(ledgerEquals(["a", "b"], ["a", "b"])).toBe(true);
    expect(ledgerEquals(["a", "b"], ["b", "a"])).toBe(false);
    expect(ledgerEquals(["a"], ["a", "b"])).toBe(false);
    expect(ledgerEquals([], [])).toBe(true);
  });
});
