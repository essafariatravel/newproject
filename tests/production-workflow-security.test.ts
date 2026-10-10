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
    expect(workflow).toContain("github.ref == 'refs/heads/release/go-live-final-2026-10-06'");
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

describe("Candidate qualification workflow boundaries", () => {
  it("prefers the Preview environment connection over the repository-wide legacy performance connection", () => {
    const workflow = readFileSync(path.join(process.cwd(), ".github/workflows/consolidation-preview.yml"), "utf8");
    expect(workflow).toContain("environment: Preview");
    expect(workflow).toContain("secrets.PREVIEW_DATABASE_URL || secrets.PERF_PREVIEW_DATABASE_URL");
    expect(workflow).toContain("DATABASE_SCHEMA: visa_os_preview");
    expect(workflow).not.toContain("secrets.PRODUCTION_DATABASE_URL");
  });

  it("provisions compatible dump and restore clients from the signed PostgreSQL repository", () => {
    const workflow = readFileSync(path.join(process.cwd(), ".github/workflows/consolidation-dr-backup.yml"), "utf8");
    const repository = workflow.indexOf("signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc");
    const install = workflow.indexOf("sudo apt-get install -y postgresql-client-17");
    expect(repository).toBeGreaterThan(0);
    expect(install).toBeGreaterThan(repository);
    expect(workflow).toContain("https://www.postgresql.org/media/keys/ACCC4CF8.asc");
    expect(workflow).toContain("https://apt.postgresql.org/pub/repos/apt");
    expect(workflow).not.toMatch(/allow-unauthenticated|trusted=yes|curl[^\n]*\|\s*(?:sudo\s+)?(?:ba)?sh/);
    expect(workflow).toContain("/usr/lib/postgresql/17/bin/pg_dump --version");
    expect(workflow).toContain("/usr/lib/postgresql/17/bin/pg_restore --version");
    expect(workflow).toContain("scripts/dr-readonly-backup.ts");
    expect(workflow).not.toMatch(/scripts\/(?:migrate|seed|dr-restore)\.ts/);
  });
});


describe("Hosted Preview verification workflow security", () => {
  const workflow = readFileSync(path.join(process.cwd(), ".github/workflows/preview-verify.yml"), "utf8");

  it("does not combine Preview credentials with repository write permission", () => {
    expect(workflow).toContain("contents: read");
    expect(workflow).not.toContain("contents: write");
    expect(workflow).not.toContain("GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}");
  });

  it("publishes verification evidence through the Actions summary", () => {
    expect(workflow).toContain("Publish the gate verdict to Actions summary");
    expect(workflow).toContain("GITHUB_STEP_SUMMARY");
    expect(workflow).not.toContain("repos/%s/commits/%s/comments");
  });
});
