import "./lib/load-env";
import { mkdir } from "node:fs/promises";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import { assertSafePerfTarget, safeTargetSummary } from "./perf-safety";

const ALLOWED_VUS = new Set([10, 50, 100, 250, 500, 1000]);

function intEnv(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv) {
  const result = spawnSync(command, args, {
    cwd: resolve("."),
    env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const error = new Error(`${command} ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}.`);
    Object.assign(error, { exitCode: result.status ?? 1 });
    throw error;
  }
}

function start(command: string, args: string[], env: NodeJS.ProcessEnv): ChildProcess {
  return spawn(command, args, {
    cwd: resolve("."),
    env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
}

async function stop(child: ChildProcess | null) {
  if (!child || child.exitCode !== null || child.killed) return;
  child.kill("SIGTERM");
  await new Promise<void>((resolveDone) => {
    const timer = setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
      resolveDone();
    }, 5000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolveDone();
    });
  });
}

async function main() {
  const target = assertSafePerfTarget();
  const vus = intEnv("PERF_VUS", 10, 1, 1000);
  if (!ALLOWED_VUS.has(vus)) throw new Error("PERF_VUS must be one of 10, 50, 100, 250, 500, 1000.");
  const holdMinutes = intEnv("PERF_TIER_HOLD_MINUTES", 5, 1, 25);
  const label = String(process.env.PERF_RUN_LABEL ?? `${vus}vu`).replace(/[^a-zA-Z0-9_-]/g, "-");
  const dir = resolve(process.env.PERF_RUN_DIR ?? `perf/results/run-${label}`);
  await mkdir(dir, { recursive: true });

  const before = resolve(dir, "db-before.json");
  const after = resolve(dir, "db-after.json");
  const summary = resolve(dir, "k6-summary.json");
  const monitor = resolve(dir, "db-monitor.json");
  const monitorSeconds = holdMinutes * 60 + 120;

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PERF_VUS: String(vus),
    PERF_PROFILE: "tier",
    PERF_HOLD: `${holdMinutes}m`,
    PERF_SUMMARY: summary,
  };

  console.log(JSON.stringify({
    action: "PERFORMANCE_TIER_START",
    target: safeTargetSummary(target),
    vus,
    holdMinutes,
    outputDirectory: dir,
    policy: "Single-tier only. This runner never escalates automatically.",
  }, null, 2));

  run("npm", ["run", "perf:preflight"], env);
  run("npm", ["run", "perf:snapshot"], { ...env, PERF_SNAPSHOT_OUTPUT: before });

  let monitorProcess: ChildProcess | null = null;
  try {
    monitorProcess = start("npm", ["run", "perf:monitor"], {
      ...env,
      PERF_MONITOR_SECONDS: String(monitorSeconds),
      PERF_MONITOR_INTERVAL_MS: process.env.PERF_MONITOR_INTERVAL_MS ?? "1000",
      PERF_MONITOR_OUTPUT: monitor,
    });

    run("npm", ["run", "perf:k6"], env);
  } finally {
    await stop(monitorProcess);
  }

  run("npm", ["run", "perf:snapshot"], { ...env, PERF_SNAPSHOT_OUTPUT: after });

  try {
    run("npm", ["run", "perf:evaluate", "--", summary, before, after], env);
  } catch (error) {
    console.error(JSON.stringify({
      action: "PERFORMANCE_TIER_STOP",
      vus,
      reason: "Evaluator rejected this tier. Investigate before any higher tier.",
      evidence: { before, after, summary, monitor },
    }, null, 2));
    throw error;
  }

  console.log(JSON.stringify({
    action: "PERFORMANCE_TIER_ELIGIBLE_FOR_REVIEW",
    vus,
    evidence: { before, after, summary, monitor },
    nextStep: "Review evidence. A human/agent may consider the next tier; this runner will not start it.",
  }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Performance tier runner failed.");
  process.exit(typeof (error as { exitCode?: unknown })?.exitCode === "number"
    ? Number((error as { exitCode: number }).exitCode)
    : 1);
});
