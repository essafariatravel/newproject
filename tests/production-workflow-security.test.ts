import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("Production release workflow security", () => {
  const workflow = readFileSync(path.join(process.cwd(), ".github/workflows/prod-release.yml"), "utf8");

  it("keeps GitHub permissions read-only while Production secrets are present", () => {
    expect(workflow).toContain("contents: read");
    expect(workflow).not.toContain("contents: write");
    expect(workflow).not.toContain("GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}");
  });

  it("allows the Production apply job only from the authorized RC branch", () => {
    expect(workflow).toContain("github.ref == 'refs/heads/release/essafaria-rc-2026-09'");
    expect(workflow).toContain("needs.audit.outputs.go == 'true'");
    expect(workflow).toContain("needs.audit.result == 'success'");
  });

  it("installs release dependencies only from package-lock without fallback resolution", () => {
    expect(workflow).toContain("npm ci --no-audit --no-fund");
    expect(workflow).not.toMatch(/\|\|\s*(npm|pnpm)\s+install/);
    expect(workflow).not.toContain("pnpm install");
  });

  it("publishes release evidence without mutating the repository", () => {
    expect(workflow.match(/Publish report to Actions summary/g)?.length).toBe(2);
    expect(workflow).toContain("GITHUB_STEP_SUMMARY");
    expect(workflow).not.toContain("repos/%s/commits/%s/comments");
  });
});
