import { describe, expect, it } from "vitest";
import { evaluateDocumentRetention, requireRetentionExecutionTarget } from "@/lib/document-retention-policy";

const decisionAt = new Date("2026-01-31T18:45:00.000Z");
const qualified = {
  statusCode: "APPROVED", decisionAt, genuineDecision: true, reopened: false,
  openRequests: false, legalReviewCurrent: true, legalHold: false,
  coverageComplete: true, reconciliationIssue: false, alreadyPurged: false,
};

describe("120 calendar day document retention", () => {
  it("protects documents on J119 and until the exact J120 anniversary across month boundaries", () => {
    expect(evaluateDocumentRetention(qualified, new Date("2026-05-30T18:45:00Z")).eligible).toBe(false);
    expect(evaluateDocumentRetention(qualified, new Date("2026-05-31T18:44:59.999Z")).eligible).toBe(false);
    expect(evaluateDocumentRetention(qualified, new Date("2026-05-31T18:45:00Z"))).toMatchObject({ eligible: true, dueAt: "2026-05-31T18:45:00.000Z" });
  });

  it.each([
    [{ statusCode: "CANCELLED" }, "CASE_ACTIVE_OR_NO_VISA_OUTCOME"],
    [{ statusCode: "IN_PROCESS" }, "CASE_ACTIVE_OR_NO_VISA_OUTCOME"],
    [{ decisionAt: null }, "FINAL_DECISION_UNPROVEN"],
    [{ genuineDecision: false }, "FINAL_DECISION_UNPROVEN"],
    [{ reopened: true }, "CASE_REOPENED"],
    [{ openRequests: true }, "OPEN_DOCUMENT_REQUEST"],
    [{ legalReviewCurrent: false }, "LEGAL_REVIEW_REQUIRED"],
    [{ legalHold: true }, "LEGAL_HOLD"],
    [{ coverageComplete: false }, "STORAGE_COVERAGE_INCOMPLETE"],
    [{ reconciliationIssue: true }, "RECONCILIATION_EVIDENCE_PROTECTED"],
  ])("fails closed for %j", (change, reason) => {
    const result = evaluateDocumentRetention({ ...qualified, ...change }, new Date("2026-06-01Z"));
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain(reason);
  });

  it("uses a new final decision's clock after a reopened dossier, never completed_at", () => {
    expect(evaluateDocumentRetention({ ...qualified, decisionAt: new Date("2026-05-01Z") }, new Date("2026-06-01Z"))).toMatchObject({ eligible: false, reasons: ["RETENTION_PERIOD_NOT_REACHED"] });
  });

  it("rejects invalid and future decision timestamps", () => {
    for (const date of [new Date("invalid"), new Date("2027-01-01Z")]) {
      expect(evaluateDocumentRetention({ ...qualified, decisionAt: date }, new Date("2026-06-01Z")).reasons).toContain("FINAL_DECISION_UNPROVEN");
    }
  });
});

describe("retention execution target", () => {
  it("requires explicit activation even on disposable loopback", () => {
    expect(() => requireRetentionExecutionTarget({ databaseUrl: "postgresql://postgres:postgres@localhost:5434/essafaria_test", schema: "public", enabled: false })).toThrow("RETENTION_DISABLED");
  });
  it.each([
    "postgresql://postgres:p@db.example.com/essafaria_test",
    "postgresql://postgres:p@localhost/production",
    "postgresql://postgres:p@127.0.0.1:5434/essafaria_test?host=db.example.com",
    "postgresql://postgres:p@127.0.0.1.evil.example:5434/essafaria_test",
  ])("refuses uncontrolled or hosted targets before connecting: %s", databaseUrl => {
    expect(() => requireRetentionExecutionTarget({ databaseUrl, schema: "public", enabled: true })).toThrow("RETENTION_TARGET_NOT_QUALIFIED");
  });
  it("accepts only the pinned disposable test database and refuses hosted context or production schema", () => {
    const target = { databaseUrl: "postgresql://postgres:postgres@localhost:5434/essafaria_test", schema: "public", enabled: true };
    expect(() => requireRetentionExecutionTarget(target)).not.toThrow();
    expect(() => requireRetentionExecutionTarget({ ...target, vercelEnvironment: "preview" })).toThrow("RETENTION_TARGET_NOT_QUALIFIED");
    expect(() => requireRetentionExecutionTarget({ ...target, schema: "visa_os" })).toThrow("RETENTION_TARGET_NOT_QUALIFIED");
  });
});
