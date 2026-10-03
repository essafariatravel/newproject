import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

type Control = {
  id: string;
  phase: string;
  releaseCritical: boolean;
  status: "PROVEN" | "HOSTED_PENDING" | "DEFERRED_DESIGN_CHOICE";
  evidence: string[];
};

describe("security regression manifest", () => {
  const manifest = JSON.parse(readFileSync(path.join(process.cwd(), "docs/security/security-regression-manifest.json"), "utf8")) as { controls: Control[] };

  it("has unique stable control IDs and real evidence paths", () => {
    expect(new Set(manifest.controls.map((control) => control.id)).size).toBe(manifest.controls.length);
    for (const control of manifest.controls) {
      expect(control.id).toMatch(/^[A-Z]+-\d{2}$/);
      for (const evidence of control.evidence) {
        expect(existsSync(path.join(process.cwd(), evidence)), `${control.id}: missing ${evidence}`).toBe(true);
      }
    }
  });

  it("does not call a code/CI/Preview-DB release-critical control proven without evidence", () => {
    for (const control of manifest.controls.filter((value) => value.releaseCritical && value.status === "PROVEN")) {
      expect(control.evidence.length, `${control.id} must name concrete evidence`).toBeGreaterThan(0);
    }
  });

  it("keeps hosted Preview checks explicitly pending rather than overstating proof", () => {
    const hosted = manifest.controls.filter((control) => control.phase === "hosted-preview");
    expect(hosted.length).toBeGreaterThan(0);
    expect(hosted.every((control) => control.status === "HOSTED_PENDING")).toBe(true);
  });
});
