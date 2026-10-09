import { readFileSync } from "node:fs";
import * as path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

function executable(script: string) {
  return ts.transpileModule(readFileSync(path.resolve(script), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText.replace("main().catch(", "return main().catch(");
}

async function runner(k6Status = 0, evaluatorStatus = 0, overrides: Partial<NodeJS.ProcessEnv> = {}, prematureMonitor = false, workloadMs?: number) {
  const calls: Array<{ command: string; args: string[]; options: { shell: boolean; env: NodeJS.ProcessEnv } }> = [];
  let exitCode = 0;
  const logs: string[] = [];
  const tierStates: string[]=[];
  const lifecycle: string[]=[];
  let clock = Date.now(), monitorStarted = clock, monitorDeadline = clock;
  const monitorChild = { exitCode: 0 as number | null, killed: false };
  class ClockDate extends Date {
    constructor(value?: string | number) { super(value ?? clock); }
    static override now() { return clock; }
  }
  const env = { PERF_SESSION_FILE: "perf/.runtime/sessions.json", PERF_APPLICATION_MANIFEST: "perf/.runtime/application-manifest.json", PERF_RUN_DIR: "C:\\Users\\Azur Computer\\evidence", npm_execpath: "C:\\Program Files\\nodejs\\npm-cli.js", ...overrides };
  const requireDouble = (name: string) => {
    if (name === "./lib/load-env") return {};
    if (name === "node:path") return path;
    if (name === "node:fs/promises") return {
      mkdir: async () => {},rm:async()=>{},
      readFile:async()=>JSON.stringify({intervalMs:1000,samplingFailed:false,samples:[{at:new Date(workloadMs === undefined ? clock-120000 : monitorStarted).toISOString()},{at:new Date((workloadMs === undefined ? clock : Math.min(clock,monitorDeadline))-(prematureMonitor?60000:0)).toISOString()}]}),
      stat: async (file:string) => {if(file.endsWith("monitor.ready"))lifecycle.push("ready");return { size: 1 };},
      writeFile:async(file:string,value:string)=>{if(file.endsWith("tier.json"))tierStates.push(JSON.parse(value).status);if(file.endsWith("monitor.stop")){lifecycle.push("stop");monitorChild.exitCode=0;}},
    };
    if (name === "./perf-safety") return { assertSafePerfTarget: () => ({}), safeTargetSummary: () => ({}) };
    if (name === "node:child_process") return {
      spawnSync: (command: string, args: string[], options: { shell: boolean; env: NodeJS.ProcessEnv }) => {
        calls.push({ command, args, options });
        if(args.includes("perf:k6")){
          lifecycle.push("k6");
          if(workloadMs !== undefined){clock+=workloadMs;monitorChild.exitCode=clock>=monitorDeadline?0:null;}
        }
        return { status: args.includes("perf:k6") ? k6Status : args.some((arg) => arg.endsWith("perf-evaluate.ts") || arg === "perf:evaluate") ? evaluatorStatus : 0 };
      },
      spawn: (command: string, args: string[], options: { shell: boolean; env: NodeJS.ProcessEnv }) => {
        calls.push({ command, args, options });
        monitorStarted=clock;
        monitorDeadline=clock+Number(options.env.PERF_MONITOR_SECONDS)*1000;
        monitorChild.exitCode=workloadMs === undefined?0:null;
        return monitorChild;
      },
    };
    throw new Error("Unexpected runner dependency");
  };
  await new Function("require", "exports", "process", "console", "Date", executable("scripts/perf-run-tier.ts"))(
    requireDouble, {}, { env, platform: "win32", execPath: "C:\\Program Files\\nodejs\\node.exe", exit: (code: number) => { exitCode = code; } },
    { log: (value: string) => logs.push(value), error: (value: string) => logs.push(value) }, ClockDate,
  );
  return { calls, exitCode, logs,tierStates,lifecycle };
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
  it.each([[50,1560],[250,1860]])("monitors the complete ramp, hold and ramp-down at %i VUs",async(vus,duration)=>{
    const result=await runner(0,0,{PERF_VUS:String(vus),PERF_TIER_HOLD_MINUTES:"20"});
    expect(result.exitCode).toBe(0);
    const monitor=result.calls.find(call=>call.args.some(arg=>arg.endsWith("perf-db-monitor.ts")));
    expect(Number(monitor?.options.env.PERF_MONITOR_SECONDS)).toBeGreaterThan(duration);
  });
  it("keeps monitoring through the reproduced 500-VU setup and shutdown overhead",async()=>{
    // The real 31-minute profile took 1923.558 seconds including setup and exit.
    const result=await runner(0,0,{PERF_VUS:"500",PERF_TIER_HOLD_MINUTES:"20"},false,1923558);
    expect(result.exitCode).toBe(0);
    expect(result.tierStates).toEqual(["IN_PROGRESS","PASS"]);
    expect(result.lifecycle).toEqual(["ready","k6","stop"]);
  });
  it("covers setup, graceful drain and teardown without shortening a 1000-VU hold",async()=>{
    const result=await runner(0,0,{PERF_VUS:"1000",PERF_TIER_HOLD_MINUTES:"20"},false,(60+1860+30+60)*1000);
    expect(result.exitCode).toBe(0);
    const k6=result.calls.find(call=>call.args.includes("perf:k6"));
    expect(k6?.options.env.PERF_HOLD).toBe("20m");
    expect(k6?.options.env.PERF_RAMP).toBe("10m");
    expect(result.tierStates).toEqual(["IN_PROGRESS","PASS"]);
  });
  it("supports an explicit two-hour soak only at a permitted proven tier",async()=>{
    const result=await runner(0,0,{PERF_VUS:"100",PERF_RUN_KIND:"SOAK",PERF_TIER_HOLD_MINUTES:"120"});
    expect(result.exitCode).toBe(0);
    const k6=result.calls.find(call=>call.args.includes("perf:k6"));
    expect(k6?.options.env.PERF_PROFILE).toBe("tier");
    expect(k6?.options.env.PERF_HOLD).toBe("120m");
  });
  it.each([
    {PERF_VUS:"1000",PERF_RUN_KIND:"SOAK",PERF_TIER_HOLD_MINUTES:"120"},
    {PERF_VUS:"100",PERF_RUN_KIND:"SOAK",PERF_TIER_HOLD_MINUTES:"5"},
    {PERF_VUS:"100",PERF_RUN_KIND:"SPIKE"},
    {PERF_VUS:"100",PERF_RUN_KIND:"UNKNOWN"},
  ])("rejects an unapproved long-run profile before traffic: %j",async(env)=>{
    const result=await runner(0,0,env);expect(result.exitCode).not.toBe(0);expect(result.calls).toHaveLength(0);
  });
  it("preserves k6 non-zero exit even when evaluation passes", async () => {
    const result = await runner(99);
    expect(result.exitCode).toBe(99);
    expect(result.tierStates).toEqual(["IN_PROGRESS","FAIL"]);
    expect(result.logs.join("\n")).toContain('"k6ExitedNonZero": true');
    expect(result.logs.join("\n")).not.toContain("PERFORMANCE_TIER_ELIGIBLE_FOR_REVIEW");
    expect(result.lifecycle).toEqual(["ready","k6","stop"]);
  });

  it("preserves evaluator rejection and k6 failure visibility", async () => {
    const result = await runner(99, 2);
    expect(result.exitCode).toBe(2);
    expect(result.logs.join("\n")).toContain('"k6ExitedNonZero": true');
  });
  it("rejects incomplete monitoring even when k6 and its evaluator both succeed",async()=>{
    const result=await runner(0,0,{},true);expect(result.exitCode).not.toBe(0);expect(result.tierStates).toEqual(["IN_PROGRESS","FAIL"]);expect(result.logs.join("\n")).toContain('"monitorFailed": true');
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
