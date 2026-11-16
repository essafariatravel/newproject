import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Phase 2.2 Tasks 11-13 / 14-15 — simplified canonical status model (source-
 * level guards; behavior coverage lives in decision-workflow/status tests).
 * Retired codes stay defined as inactive legacy (history interpretability).
 */
const MIG = readFileSync("migrations/0006_simplified_status_model.sql", "utf8");

const CANONICAL = [
  "DRAFT", "SUBMITTED", "DOCUMENTS_CHECKING", "DOCUMENTS_REQUESTED",
  "IN_PROCESS", "EMBASSY_SENT", "APPROVED", "REJECTED",
] as const;
const RETIRED = ["UNDER_REVIEW", "DOCUMENTS_REQUIRED", "PROCESSING", "EMBASSY_SUBMISSION", "AWAITING_DECISION", "COMPLETED"] as const;

describe("status model — migration 0006", () => {
  it("introduces exactly the canonical default set with EN/FR/AR labels and ordering", () => {
    for (const code of CANONICAL) {
      expect(MIG.includes(`'${code}'`), `canonical status missing: ${code}`).toBe(true);
    }
    expect(MIG).toContain("name_fr");
    expect(MIG).toContain("name_ar");
    expect(MIG).toContain("sort_order");
    expect(MIG).toContain("is_terminal");
    expect(MIG).toContain("active");
  });

  it("retires obsolete statuses safely — deactivation, never deletion", () => {
    for (const code of RETIRED) {
      expect(MIG.includes(`'${code}'`), `retired status unlisted: ${code}`).toBe(true);
    }
    expect(MIG).not.toMatch(/delete from statuses/i);
    expect(MIG).toContain("set active = false");
  });

  it("remaps live applications to canonical equivalents and preserves history", () => {
    for (const [from, to] of [
      ["UNDER_REVIEW", "DOCUMENTS_CHECKING"],
      ["DOCUMENTS_REQUIRED", "DOCUMENTS_REQUESTED"],
      ["PROCESSING", "IN_PROCESS"],
      ["EMBASSY_SUBMISSION", "EMBASSY_SENT"],
      ["AWAITING_DECISION", "IN_PROCESS"],
      ["COMPLETED", "APPROVED"],
    ]) {
      expect(MIG).toContain(`'${from}=${to}'`);
    }
    expect(MIG).toContain("application_status_history");
    expect(MIG).toContain("history preserved");
  });

  it("establishes the canonical transition graph (embassy optional, finals reachable from IN_PROCESS directly)", () => {
    for (const [from, to] of [
      ["DRAFT", "SUBMITTED"],
      ["SUBMITTED", "DOCUMENTS_CHECKING"],
      ["DOCUMENTS_CHECKING", "DOCUMENTS_REQUESTED"],
      ["DOCUMENTS_REQUESTED", "DOCUMENTS_CHECKING"],
      ["DOCUMENTS_CHECKING", "IN_PROCESS"],
      ["IN_PROCESS", "EMBASSY_SENT"],
      ["IN_PROCESS", "APPROVED"],
      ["IN_PROCESS", "REJECTED"],
      ["EMBASSY_SENT", "APPROVED"],
      ["EMBASSY_SENT", "REJECTED"],
    ]) {
      expect(MIG).toContain(`('${from}'`);
      expect(MIG).toContain(`'${to}'`);
    }
    // removing ambiguity: no path forces embassy before decision
    expect(MIG).not.toMatch(/EMBASSY_SENT.*mandatory/i);
  });
});

describe("status model — decision outcomes follow the simplified graph", () => {
  it("final outcomes are reachable from IN_PROCESS and EMBASSY_SENT only (no legacy sources)", () => {
    const s = readFileSync("src/lib/applications.ts", "utf8");
    const block = s.slice(s.indexOf("const DECISION_SOURCES"), s.indexOf("};", s.indexOf("const DECISION_SOURCES")) + 2);
    expect(block).toContain("IN_PROCESS");
    expect(block).toContain("EMBASSY_SENT");
    for (const legacy of ["PROCESSING", "AWAITING_DECISION", "EMBASSY_SUBMISSION"]) {
      expect(block.includes(legacy), `legacy decision source must go: ${legacy}`).toBe(false);
    }
    expect(s).toContain('if (to.code === "DOCUMENTS_REQUESTED")');
  });
});

describe("status model — SUPER_ADMIN configuration surface", () => {
  it("create/update accept EN/FR/AR labels + ordering; delete is reference-safe", () => {
    const cfg = readFileSync("src/app/actions/config.ts", "utf8");
    expect(cfg).toContain("nameFr");
    expect(cfg).toContain("nameAr");
    expect(cfg).toContain("sortOrder");
    expect(cfg).toContain("deleteStatusAction");
    expect(cfg).toContain("CONFIG_STATUS_DELETED");
    expect(cfg).toContain("deactivated-referenced");
    // no deleted history
    expect(cfg).toContain("deactivated instead of deleted");
  });
});
