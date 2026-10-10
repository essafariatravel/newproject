import { readFileSync } from "node:fs";
import * as path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const executable = ts.transpileModule(readFileSync(path.resolve("scripts/perf-db-monitor.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText.replace("main().catch(", "return main().catch(");

async function monitor(owned: boolean, stopAtMs?: number, failAfterSamples?: number) {
  const started = 1_000_000;
  let clock = started, exitCode = 0, connections = 0, released = 0, ended = false;
  const files = new Map<string, string>();
  class ClockDate extends Date {
    constructor(value?: string | number) { super(value ?? clock); }
    static override now() { return clock; }
  }
  const env = { PERF_MONITOR_SECONDS: "10", PERF_MONITOR_INTERVAL_MS: "1000", PERF_MONITOR_OUTPUT: "monitor.json", PERF_MONITOR_READY_FILE: "monitor.ready", ...(owned ? { PERF_MONITOR_STOP_FILE: "monitor.stop" } : {}) };
  const requireDouble = (name: string) => {
    if (name === "./lib/load-env") return {};
    if (name === "node:path") return path;
    if (name === "node:fs/promises") return {
      mkdir: async () => {}, writeFile: async (file: string, value: string) => { files.set(path.basename(file), value); },
      stat: async () => {
        if (stopAtMs !== undefined && clock >= started + stopAtMs) return { size: 4 };
        throw Object.assign(Error("Not found"), { code: "ENOENT" });
      },
    };
    if (name === "../src/lib/database-config") return { databasePoolConfig: () => ({}) };
    if (name === "./perf-safety") return { assertSafePerfTarget: () => ({}), safeTargetSummary: () => ({ schema: "visa_os_preview" }) };
    if (name === "pg") return { Pool: class {
      async connect() {
        if (failAfterSamples !== undefined && connections >= failAfterSamples) throw Error("DB unavailable");
        connections++;
        return { query: async () => ({ rows: [{ total: 1, active: 1, idle: 0, waiting: 0, waiting_locks: 0 }] }), release: () => { released++; } };
      }
      async end() { ended = true; }
    } };
    throw Error("Unexpected monitor dependency");
  };
  await new Function("require", "exports", "process", "console", "Date", "setTimeout", executable)(
    requireDouble, {}, { env, once: () => {}, removeListener: () => {}, exit: (code: number) => { exitCode = code; } },
    { log: () => {}, error: () => {} }, ClockDate, (callback: () => void, ms: number) => { clock += ms; callback(); },
  );
  return { exitCode, evidence: JSON.parse(files.get("monitor.json")!), ready: files.get("monitor.ready"), released, ended };
}

describe("database monitor completion ownership", () => {
  it("flushes samples and closes its connection when the owned workload signals completion", async () => {
    const result = await monitor(true, 5000);
    expect(result.exitCode).toBe(0);
    expect(result.evidence.samples).toHaveLength(5);
    expect(result.evidence.stoppedEarly).toBe(true);
    expect(result.evidence.samplingFailed).toBe(false);
    expect(result.released).toBe(5);
    expect(result.ended).toBe(true);
    expect(result.ready).toBe(result.evidence.samples[0].at);
  });
  it("fails closed and preserves evidence if the watchdog expires before owned workload completion", async () => {
    const result = await monitor(true);
    expect(result.exitCode).toBe(1);
    expect(result.evidence.samples).toHaveLength(10);
    expect(result.evidence.completionObserved).toBe(false);
    expect(result.evidence.watchdogExpired).toBe(true);
    expect(result.ended).toBe(true);
  });
  it("still permits an explicitly timed standalone monitor to complete normally", async () => {
    const result = await monitor(false);
    expect(result.exitCode).toBe(0);
    expect(result.evidence.samples).toHaveLength(10);
    expect(result.evidence.stoppedEarly).toBe(false);
  });
  it("writes partial evidence and rejects database sampling failure", async () => {
    const result = await monitor(true, 5000, 2);
    expect(result.exitCode).toBe(1);
    expect(result.evidence.samples).toHaveLength(2);
    expect(result.evidence.samplingFailed).toBe(true);
    expect(result.ended).toBe(true);
  });
});
