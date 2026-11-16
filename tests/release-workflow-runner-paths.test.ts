import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

type Step = { name?: string; shell?: string; run?: string };
type Job = { env?: Record<string, string>; steps: Step[] };
const yaml = createRequire(import.meta.url)("js-yaml");
const workflow = yaml.load(readFileSync(".github/workflows/prod-release.yml", "utf8")) as { jobs: Record<string, Job> };
const files = {
  RELEASE_APPROVAL_FILE: "release-approval.json",
  RELEASE_DR_VERIFIED_MANIFEST: "release-dr-verified.json",
  RELEASE_DR_EVIDENCE_BUNDLE: "release-dr-bundle.json",
  RELEASE_KEY_CUSTODY_RECEIPT: "release-custody-receipt.json",
  RELEASE_MANAGED_BACKUP_EVIDENCE: "release-managed-backup.json",
  RELEASE_EXTERNAL_STORAGE_EVIDENCE: "release-external-recovery.json",
  RELEASE_BATCH_A_POSTFLIGHT_FILE: "release-batch-a-postflight.json",
  RELEASE_BATCH_POSTFLIGHT_FILE: "release-batch-postflight.json",
};

describe.each(["audit", "apply"])("release %s runner paths", (name) => {
  const job = workflow.jobs[name]!;
  const initialize = () => {
    const step = job.steps.find((s) => s.name === "Configure private release evidence paths");
    expect(step, "runner paths must be configured by an actual runtime step").toBeDefined();
    expect(step!.shell).toBe("node {0}");
    expect(job.steps.indexOf(step!)).toBeLessThan(job.steps.findIndex((s) => s.name === "Stage exact owner approval and selected recovery evidence privately"));
    return step!;
  };

  it("never uses the unavailable runner context in job-level env", () => {
    expect(Object.values(job.env ?? {}).join("\n")).not.toMatch(/\$\{\{\s*runner(?:\.|\[)/);
  });

  it("persists all eight private paths and stages the selected real evidence without printing it", () => {
    const step = initialize();
    const dir = mkdtempSync(path.join(tmpdir(), "release paths "));
    try {
      const commandFile = path.join(dir, "github-env");
      writeFileSync(commandFile, "", { flag: "wx" });
      const env = { ...process.env, RUNNER_TEMP: dir, GITHUB_ENV: commandFile };
      const initialized = spawnSync(process.execPath, ["-e", step.run!], { env, shell: false, encoding: "utf8" });
      expect(initialized.status, initialized.stderr).toBe(0);
      expect(initialized.stdout).toBe("");
      const bindings = Object.fromEntries(readFileSync(commandFile, "utf8").trim().split("\n").map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }));
      expect(bindings).toEqual(Object.fromEntries(Object.entries(files).map(([key, file]) => [key, path.join(dir, file)])));
      const approval = JSON.stringify({ version: 2, batch: "A", recoveryPolicy: { kind: "SUPABASE_MANAGED_PHYSICAL_SIGNED_OBJECTS_V2" } });
      const staged = spawnSync(process.execPath, ["scripts/stage-release-approval.cjs"], {
        env: { ...env, ...bindings, RELEASE_APPROVAL_JSON: approval, RELEASE_APPROVAL_SHA256: createHash("sha256").update(approval).digest("hex"), RELEASE_MANAGED_BACKUP_JSON: '{"syntheticObservation":true}', RELEASE_EXTERNAL_STORAGE_RECOVERY_JSON: '{"syntheticReceipt":true}' },
        shell: false, encoding: "utf8",
      });
      expect(staged.status, staged.stderr).toBe(0);
      expect(readFileSync(bindings.RELEASE_APPROVAL_FILE!, "utf8")).toBe(approval);
      expect(readFileSync(bindings.RELEASE_MANAGED_BACKUP_EVIDENCE!, "utf8")).toBe('{"syntheticObservation":true}');
      expect(readFileSync(bindings.RELEASE_EXTERNAL_STORAGE_EVIDENCE!, "utf8")).toBe('{"syntheticReceipt":true}');
      expect(staged.stdout).not.toContain("syntheticObservation");
      expect(staged.stdout).not.toContain("syntheticReceipt");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it.each([undefined, "relative-temp", "injected\nOTHER=value"])("refuses invalid RUNNER_TEMP before writing: %s", (root) => {
    const step = initialize();
    const dir = mkdtempSync(path.join(tmpdir(), "release-negative-"));
    try {
      const commandFile = path.join(dir, "github-env");
      writeFileSync(commandFile, "");
      const env: NodeJS.ProcessEnv = { ...process.env, GITHUB_ENV: commandFile };
      if (root === undefined) delete env.RUNNER_TEMP;
      else env.RUNNER_TEMP = root;
      const result = spawnSync(process.execPath, ["-e", step.run!], { env, shell: false, encoding: "utf8" });
      expect(result.status).not.toBe(0);
      expect(readFileSync(commandFile, "utf8")).toBe("");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
