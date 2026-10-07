import { readFileSync } from "node:fs";
import * as path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

function executable(script: string) {
  return ts.transpileModule(readFileSync(path.resolve(script), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText.replace("main().catch(", "return main().catch(");
}

async function runner(k6Status = 0, evaluatorStatus = 0) {
  const calls: Array<{ command: string; args: string[]; options: { shell: boolean; env: NodeJS.ProcessEnv } }> = [];
  let exitCode = 0;
  const logs: string[] = [];
  const tierStates: string[]=[];
  const env = { PERF_SESSION_FILE: "perf/.runtime/sessions.json", PERF_APPLICATION_MANIFEST: "perf/.runtime/application-manifest.json", PERF_RUN_DIR: "C:\\Users\\Azur Computer\\evidence", npm_execpath: "C:\\Program Files\\nodejs\\npm-cli.js" };
  const requireDouble = (name: string) => {
    if (name === "./lib/load-env") return {};
    if (name === "node:path") return path;
    if (name === "node:fs/promises") return { mkdir: async () => {}, stat: async () => ({ size: 1 }),writeFile:async(_file:string,value:string)=>{tierStates.push(JSON.parse(value).status);} };
    if (name === "./perf-safety") return { assertSafePerfTarget: () => ({}), safeTargetSummary: () => ({}) };
    if (name === "node:child_process") return {
      spawnSync: (command: string, args: string[], options: { shell: boolean; env: NodeJS.ProcessEnv }) => {
        calls.push({ command, args, options });
        return { status: args.includes("perf:k6") ? k6Status : args.some((arg) => arg.endsWith("perf-evaluate.ts") || arg === "perf:evaluate") ? evaluatorStatus : 0 };
      },
      spawn: (command: string, args: string[], options: { shell: boolean; env: NodeJS.ProcessEnv }) => {
        calls.push({ command, args, options });
        return { exitCode: 0, killed: false };
      },
    };
    throw new Error("Unexpected runner dependency");
  };
  await new Function("require", "exports", "process", "console", executable("scripts/perf-run-tier.ts"))(
    requireDouble, {}, { env, platform: "win32", execPath: "C:\\Program Files\\nodejs\\node.exe", exit: (code: number) => { exitCode = code; } },
    { log: (value: string) => logs.push(value), error: (value: string) => logs.push(value) },
  );
  return { calls, exitCode, logs,tierStates };
}

async function evaluate(thresholdFailed = false, slow = false) {
  const summaryPath = "C:\\Users\\Azur Computer\\evidence\\k6-summary.json";
  const beforePath = "C:\\Users\\Azur Computer\\evidence\\db-before.json";
  const afterPath = "C:\\Users\\Azur Computer\\evidence\\db-after.json";
  const snapshot = { databaseStats: [{ deadlocks: 0, temp_bytes: 0, xact_rollback: 0 }], waitingLocks: 0 };
  const data: Record<string, unknown> = {
    [summaryPath]: { metrics: {
      http_req_failed: { values: { rate: 0 } }, unexpected_failure: { values: { rate: 0 } },
      http_req_duration: { values: { med: 10, "p(95)": slow ? 10000 : 20, "p(99)": 30 }, thresholds: { "p(95)<500": { ok: !thresholdFailed } } },
      iterations: { values: { count: 100 } },
      op_agency_dashboard: { values: { "p(95)": 20, "p(99)": 30 } },
    } },
    [beforePath]: snapshot, [afterPath]: snapshot,
    "perf/budgets.json": { global: { p95Ms: 1000, errorRateMax: 0.01, unexpectedFailureRateMax: 0.01 }, operations: { agency_dashboard: { p95Ms: 500, p99Ms: 800 } } },
  };
  const reads: string[] = [];
  let output = "";
  const proc = { argv: ["node", "perf-evaluate.ts", summaryPath, beforePath, afterPath], env: {}, exitCode: 0, exit: (code: number) => { proc.exitCode = code; } };
  const requireDouble = (name: string) => name === "node:path" ? path : {
    readFile: async (file: string) => { reads.push(file); if (!(file in data)) throw new Error("Evidence argument split"); return JSON.stringify(data[file]); },
  };
  await new Function("require", "exports", "process", "console", executable("scripts/perf-evaluate.ts"))(
    requireDouble, {}, proc, { log: (value: string) => { output = value; }, error: (value: string) => { output = value; } },
  );
  return { reads, output: JSON.parse(output), exitCode: proc.exitCode };
}

describe("Windows Performance evaluation", () => {
  it("passes spaced evidence paths directly to Node without a command shell", async () => {
    const result = await runner();
    expect(result.exitCode).toBe(0);
    expect(result.calls.every((call) => call.options.shell === false)).toBe(true);
    const evaluation = result.calls.find((call) => call.args.some((arg) => arg.endsWith("perf-evaluate.ts")));
    expect(evaluation?.command).toBe("C:\\Program Files\\nodejs\\node.exe");
    expect(evaluation?.args.slice(0, 2)).toEqual(["--import", "tsx"]);
    expect(evaluation?.args.slice(-3)).toEqual(["k6-summary.json", "db-before.json", "db-after.json"].map((file) => path.resolve("C:\\Users\\Azur Computer\\evidence", file)));
  });

  it("resolves repository-relative fixture paths before passing them to k6", async () => {
    const result = await runner();
    const k6 = result.calls.find((call) => call.args.includes("perf:k6"));
    expect(k6?.options.env.PERF_SESSION_FILE).toBe(path.resolve("perf/.runtime/sessions.json"));
    expect(k6?.options.env.PERF_APPLICATION_MANIFEST).toBe(path.resolve("perf/.runtime/application-manifest.json"));
  });
  it("preserves k6 non-zero exit even when evaluation passes", async () => {
    const result = await runner(99);
    expect(result.exitCode).toBe(99);
    expect(result.tierStates).toEqual(["IN_PROGRESS","FAIL"]);
    expect(result.logs.join("\n")).toContain('"k6ExitedNonZero": true');
    expect(result.logs.join("\n")).not.toContain("PERFORMANCE_TIER_ELIGIBLE_FOR_REVIEW");
  });

  it("preserves evaluator rejection and k6 failure visibility", async () => {
    const result = await runner(99, 2);
    expect(result.exitCode).toBe(2);
    expect(result.logs.join("\n")).toContain('"k6ExitedNonZero": true');
  });

  it("evaluates full paths containing spaces", async () => {
    const result = await evaluate();
    expect(result.exitCode).toBe(0);
    expect(result.output.verdict).toContain("SCREENING PASS");
    expect(result.reads.filter((file) => file.includes("Azur Computer"))).toHaveLength(3);
  });

  it("does not turn a failed k6 threshold into screening PASS", async () => {
    const result = await evaluate(true);
    expect(result.exitCode).toBe(2);
    expect(result.output.verdict).toContain("STOP");
    expect(result.output.k6ThresholdFailures).toEqual([{ metric: "http_req_duration", threshold: "p(95)<500" }]);
  });

  it("continues to reject real performance budget failures", async () => {
    expect((await evaluate(false, true)).exitCode).toBe(2);
  });
});
