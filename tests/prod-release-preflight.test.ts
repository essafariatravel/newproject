/**
 * Production release preflight guards (release 0013 → 0017).
 *
 * These tests exercise the FAIL-CLOSED core of the release tooling without a
 * database: importing `scripts/prod-release.ts` never calls `main()` (the CLI
 * entry point is guarded), so no connection is created and nothing is written.
 *
 * They pin exactly the behaviour the release depends on:
 *   - the approved baseline is the live Production state captured by the
 *     read-only audit (ledger 0001-0012 + counts/checksums),
 *   - the release scope is exactly 0013-0017,
 *   - a drifted Production (a new row, a changed balance, an extra pending
 *     migration) BLOCKS the release instead of being waved through.
 */
import { describe, expect, it } from "vitest";
import {
  APPROVED_BASELINE,
  PROJECT_USER,
  RELEASE_SCOPE,
  TARGET_LEDGER,
  ledgerEquals,
  pendingMigrations,
  preflightFindings,
  projectGuardFindings,
  type SnapshotReport,
} from "../scripts/prod-release";

/** A live snapshot that matches the approved baseline exactly. */
function approvedSnapshot(): SnapshotReport {
  return {
    counts: { ...APPROVED_BASELINE.counts },
    walletChecksum: APPROVED_BASELINE.walletChecksum,
    agencyWallets: APPROVED_BASELINE.agencyWalletsChecksum,
    ledger: [...APPROVED_BASELINE.ledger],
    brand: { "brand.name": "ESSAFARIA TRAVEL" },
    statusMix: { APPROVED: 2 },
    remapExposure: {},
    columnsValid: false,
    schemaError: '42703: column "agency_uploadable" does not exist',
    snapshotTables: [],
    guardNotes: [],
  };
}

const approvedPending = () => pendingMigrations(APPROVED_BASELINE.ledger);

describe("release scope and baseline", () => {
  it("authorizes exactly migrations 0013 → 0017 on top of ledger 0001-0012", () => {
    expect([...RELEASE_SCOPE]).toEqual([
      "0013_embassy_applicability.sql",
      "0014_wallet_topup_requests.sql",
      "0015_schema_safe_references.sql",
      "0016_document_type_audience.sql",
      "0017_decision_types_audience.sql",
    ]);
    expect([...APPROVED_BASELINE.ledger]).toEqual(
      Array.from({ length: 12 }, (_, i) => expect.stringContaining(`00${String(i + 1).padStart(2, "0")}`)),
    );
    expect(TARGET_LEDGER.length).toBe(17);
    expect(TARGET_LEDGER[TARGET_LEDGER.length - 1]).toBe("0017_decision_types_audience.sql");
  });

  it("records the live Production baseline captured by the read-only audit", () => {
    expect(APPROVED_BASELINE.counts.users).toBe(4);
    expect(APPROVED_BASELINE.counts.agencies).toBe(4);
    expect(APPROVED_BASELINE.counts.applications).toBe(2);
    expect(APPROVED_BASELINE.walletChecksum).toBe("8508159c7279636306f48efd9ddf30ac");
    expect(APPROVED_BASELINE.agencyWalletsChecksum).toBe("0f091712b9965c5802b0811bfe07acaa");
    expect(PROJECT_USER).toBe("postgres.xgetzgixalrsmuvfthpf");
  });

  it("computes the pending set from the repository, not from a hard-coded list", () => {
    const pending = approvedPending();
    expect(pending).toEqual([...RELEASE_SCOPE]);
  });
});

describe("preflight verdict is fail-closed", () => {
  it("is READY when live Production equals the approved baseline", () => {
    expect(preflightFindings(approvedSnapshot(), approvedPending())).toEqual([]);
  });

  it("blocks on a ledger that moved (e.g. a migration applied outside this release)", () => {
    const live = approvedSnapshot();
    live.ledger = [...APPROVED_BASELINE.ledger, "0013_embassy_applicability.sql"];
    const findings = preflightFindings(live, approvedPending());
    expect(findings.some((f) => f.includes("ledger differs"))).toBe(true);
  });

  it("blocks when the pending set is not exactly this release", () => {
    const live = approvedSnapshot();
    const findings = preflightFindings(live, [...approvedPending(), "0018_something_new.sql"]);
    expect(findings.some((f) => f.includes("pending migration set is not this release"))).toBe(true);
  });

  it("blocks on any protected-count drift except append-only audit_logs growth", () => {
    const drifted = approvedSnapshot();
    drifted.counts.applications = 3;
    expect(preflightFindings(drifted, approvedPending()).some((f) => f.startsWith("applications:"))).toBe(true);

    const smallerAudit = approvedSnapshot();
    smallerAudit.counts.audit_logs = (APPROVED_BASELINE.counts.audit_logs ?? 0) - 1;
    expect(preflightFindings(smallerAudit, approvedPending()).some((f) => f.startsWith("audit_logs="))).toBe(true);

    const grownAudit = approvedSnapshot();
    grownAudit.counts.audit_logs = (APPROVED_BASELINE.counts.audit_logs ?? 0) + 12;
    expect(preflightFindings(grownAudit, approvedPending())).toEqual([]);
  });

  it("blocks when wallet or agency balances changed at all", () => {
    const wallet = approvedSnapshot();
    wallet.walletChecksum = "deadbeef";
    expect(preflightFindings(wallet, approvedPending()).some((f) => f.includes("wallet ledger checksum differs"))).toBe(true);

    const balances = approvedSnapshot();
    balances.agencyWallets = "deadbeef";
    expect(preflightFindings(balances, approvedPending()).some((f) => f.includes("agency balances checksum differs"))).toBe(true);
  });

  it("pins the Production project identity from the connection username", () => {
    expect(projectGuardFindings(`postgresql://postgres.xgetzgixalrsmuvfthpf:pw@aws-1-us-east-1.pooler.supabase.com:6543/postgres`)).toEqual([]);
    const foreign = projectGuardFindings(`postgresql://postgres.ridoyedqgiavgcwnpubq:pw@aws-1-us-east-1.pooler.supabase.com:6543/postgres`);
    expect(foreign.some((f) => f.includes("identity of the approved production project"))).toBe(true);
    expect(projectGuardFindings("not-a-url")).toHaveLength(1);
  });

  it("treats the columnsValid=false pre-migration state as expected, not as drift", () => {
    const live = approvedSnapshot();
    expect(live.columnsValid).toBe(false);
    expect(preflightFindings(live, approvedPending())).toEqual([]);
  });
});

describe("ledger comparison is order- and length-sensitive", () => {
  it("compares element by element", () => {
    expect(ledgerEquals(["a", "b"], ["a", "b"])).toBe(true);
    expect(ledgerEquals(["a", "b"], ["b", "a"])).toBe(false);
    expect(ledgerEquals(["a"], ["a", "b"])).toBe(false);
    expect(ledgerEquals([], [])).toBe(true);
  });
});
