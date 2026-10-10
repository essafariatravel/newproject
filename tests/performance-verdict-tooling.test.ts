import { afterEach, describe, expect, test } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const tempDirs: string[] = [];

function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), "essafaria perf verdict "));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

function run(script: string, args: string[]) {
  return spawnSync(process.execPath, ["--import", "tsx", resolve(script), ...args], {
    cwd: resolve("."),
    encoding: "utf8",
    env: { ...process.env },
    shell: false,
  });
}

function dbSnapshot(deadlocks = 0, waitingLocks = 0) {
  return {
    waitingLocks,
    databaseStats: [{ deadlocks, temp_bytes: 0, xact_rollback: 0 }],
    connections: [{ connections: 1 }],
    pgStatStatements: [],
    tableStats: [],
  };
}

function summary(operationP95 = 700, operationP99 = 1400, globalP95 = 900) {
  return {
    metrics: {
      http_req_failed: { values: { rate: 0 } },
      unexpected_failure: { values: { rate: 0 } },
      http_req_duration: { values: { med: 300, "p(95)": globalP95, "p(99)": 1400 } },
      http_reqs: { values: { rate: 10 } },
      iterations: { values: { count: 100 } },
      op_agency_dashboard: { values: { "p(95)": operationP95, "p(99)": operationP99 } },
    },
  };
}

describe("performance verdict tooling fails closed", () => {
  test("evaluator passes a clean run within operation budgets", () => {
    const dir = tempDir();
    const s = join(dir, "summary.json"), before = join(dir, "before.json"), after = join(dir, "after.json");
    writeFileSync(s, JSON.stringify(summary()));
    writeFileSync(before, JSON.stringify(dbSnapshot(0, 0)));
    writeFileSync(after, JSON.stringify(dbSnapshot(0, 0)));
    const result = run("scripts/perf-evaluate.ts", [s, before, after]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("SCREENING PASS");
  });

  test("evaluator stops when an observed operation exceeds p95 budget", () => {
    const dir = tempDir();
    const s = join(dir, "summary.json"), before = join(dir, "before.json"), after = join(dir, "after.json");
    writeFileSync(s, JSON.stringify(summary(900, 1400)));
    writeFileSync(before, JSON.stringify(dbSnapshot(0, 0)));
    writeFileSync(after, JSON.stringify(dbSnapshot(0, 0)));
    const result = run("scripts/perf-evaluate.ts", [s, before, after]);
    expect(result.status).toBe(2);
    expect(result.stdout).toContain("agency_dashboard");
    expect(result.stdout).toContain("STOP");
  });

  test("evaluator stops on a new database deadlock", () => {
    const dir = tempDir();
    const s = join(dir, "summary.json"), before = join(dir, "before.json"), after = join(dir, "after.json");
    writeFileSync(s, JSON.stringify(summary()));
    writeFileSync(before, JSON.stringify(dbSnapshot(0, 0)));
    writeFileSync(after, JSON.stringify(dbSnapshot(1, 0)));
    const result = run("scripts/perf-evaluate.ts", [s, before, after]);
    expect(result.status).toBe(2);
    expect(result.stdout).toContain("no new database deadlocks");
  });

  test("final report refuses PASS when wallet correctness is unproven", () => {
    const dir = tempDir();
    const s = join(dir, "summary.json"), before = join(dir, "before.json"), after = join(dir, "after.json");
    const manifest = join(dir, "manifest.json"), report = join(dir, "report.md");
    writeFileSync(s, JSON.stringify(summary()));
    writeFileSync(before, JSON.stringify(dbSnapshot(0, 0)));
    writeFileSync(after, JSON.stringify(dbSnapshot(0, 0)));
    writeFileSync(manifest, JSON.stringify({
      environment: "disposable-test",
      commit: "test",
      walletCorrectness: false,
      storageCorrectness: true,
      runs: [{ label: "10-vu", vus: 10, summary: s, beforeDb: before, afterDb: after }],
    }));
    const result = run("scripts/perf-report.ts", [manifest, report]);
    expect(result.status).toBe(2);
    expect(readFileSync(report, "utf8")).toContain("PERFORMANCE GATE FAIL");
  });

  test("final report states only the highest demonstrated passing tier", () => {
    const dir = tempDir();
    const s10 = join(dir, "10.json"), s50 = join(dir, "50.json");
    const before10 = join(dir, "before10.json"), after10 = join(dir, "after10.json");
    const before50 = join(dir, "before50.json"), after50 = join(dir, "after50.json");
    const manifest = join(dir, "manifest.json"), report = join(dir, "report.md");
    writeFileSync(s10, JSON.stringify(summary()));
    writeFileSync(s50, JSON.stringify(summary(900, 1800)));
    for (const p of [before10, after10, before50, after50]) writeFileSync(p, JSON.stringify(dbSnapshot(0, 0)));
    writeFileSync(manifest, JSON.stringify({
      environment: "disposable-test",
      commit: "test",
      walletCorrectness: true,
      storageCorrectness: true,
      runs: [
        { label: "10-vu", vus: 10, summary: s10, beforeDb: before10, afterDb: after10 },
        { label: "50-vu", vus: 50, summary: s50, beforeDb: before50, afterDb: after50 },
      ],
    }));
    const result = run("scripts/perf-report.ts", [manifest, report]);
    expect(result.status).toBe(0);
    const markdown = readFileSync(report, "utf8");
    expect(markdown).toContain("10 VUs demonstrated");
    expect(markdown).toContain("50-VU tier failed");
    expect(markdown).not.toContain("50 VUs demonstrated");
  });

  test("regression detector fails at the configured 25 percent threshold", () => {
    const dir = tempDir();
    const baseline = join(dir, "baseline.json"), candidate = join(dir, "candidate.json");
    writeFileSync(baseline, JSON.stringify({
      datasetId: "base", datasetRows: 10000, queries: [{ name: "staff_list", p95Ms: 100 }],
    }));
    writeFileSync(candidate, JSON.stringify({
      datasetId: "candidate", datasetRows: 10000, queries: [{ name: "staff_list", p95Ms: 130 }],
    }));
    const result = run("scripts/perf-regression.ts", [baseline, candidate]);
    expect(result.status).toBe(2);
    expect(result.stdout).toContain("REGRESSION FAIL");
  });
});
