import "./lib/load-env";
import { mkdir, stat } from "node:fs/promises";
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

function invocation(command: string, args: string[], env: NodeJS.ProcessEnv): [string, string[]] {
  if (command !== "npm") return [command, args];
  if (!env.npm_execpath) throw new Error("Run the tier runner through npm so npm_execpath is available.");
  return [process.execPath, [env.npm_execpath, ...args]];
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv) {
  const [executable, argv] = invocation(command, args, env);
  const result = spawnSync(executable, argv, {
    cwd: resolve("."),
    env,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const error = new Error(`${command} ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}.`);
    Object.assign(error, { exitCode: result.status ?? 1 });
    throw error;
  }
}

function start(command: string, args: string[], env: NodeJS.ProcessEnv): ChildProcess {
  const [executable, argv] = invocation(command, args, env);
  return spawn(executable, argv, {
    cwd: resolve("."),
    env,
    stdio: "inherit",
    shell: false,
  });
}

async function stop(child: ChildProcess | null) {
  if (!child || child.exitCode !== null || child.killed) return;

  if (process.platform === "win32") {
    await new Promise<void>((resolveDone, reject) => {
      const timer = setTimeout(() => {
        if (child.exitCode === null && child.pid) {
          spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
            stdio: "ignore",
            shell: false,
          });
          reject(new Error(
            "DB monitor did not exit naturally within 30 seconds after k6; performance evidence is incomplete."
          ));
          return;
        }
        resolveDone();
      }, 30000);

      child.once("exit", (code) => {
        clearTimeout(timer);
        if (code === 0) resolveDone();
        else reject(new Error(`DB monitor exited with code ${code ?? "unknown"}.`));
      });

      if (child.exitCode !== null) {
        clearTimeout(timer);
        resolveDone();
      }
    });
    return;
  }

  child.kill("SIGTERM");
  await new Promise<void>((resolveDone, reject) => {
    const timer = setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
      reject(new Error("DB monitor did not exit within 5 seconds after SIGTERM."));
    }, 5000);
    child.once("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolveDone();
      else reject(new Error(`DB monitor exited with code ${code ?? "unknown"}.`));
    });
  });
}

async function evidenceFileReady(path: string): Promise<boolean> {
  try {
    return (await stat(path)).size > 0;
  } catch {
    return false;
  }
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
  const evaluation = resolve(dir, "evaluation.json");
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
  run("npm", ["run", "perf:snapshot"], { ...env, PERF_SNAPSHOT_FILE: before });

  let monitorProcess: ChildProcess | null = null;
  let k6Error: unknown = null;
  let monitorError: unknown = null;
  try {
    monitorProcess = start("npm", ["run", "perf:monitor"], {
      ...env,
      PERF_MONITOR_SECONDS: String(monitorSeconds),
      PERF_MONITOR_INTERVAL_MS: process.env.PERF_MONITOR_INTERVAL_MS ?? "1000",
      PERF_MONITOR_OUTPUT: monitor,
    });

    try {
      run("npm", ["run", "perf:k6"], env);
    } catch (error) {
      // Preserve all post-run evidence even when k6 itself exits non-zero.
      k6Error = error;
    }
  } finally {
    try {
      await stop(monitorProcess);
    } catch (error) {
      monitorError = error;
    }
  }

  // Always preserve post-run database evidence when the DB is still reachable.
  run("npm", ["run", "perf:snapshot"], { ...env, PERF_SNAPSHOT_FILE: after });

  let evaluationError: unknown = null;
  try {
    run(process.execPath, ["--import", "tsx", resolve("scripts/perf-evaluate.ts"), summary, before, after], {
      ...env,
      PERF_EVALUATE_OUTPUT: evaluation,
    });
  } catch (error) {
    evaluationError = error;
  }

  const monitorReady = await evidenceFileReady(monitor);
  if (monitorError || !monitorReady || evaluationError || k6Error) {
    console.error(JSON.stringify({
      action: "PERFORMANCE_TIER_STOP",
      vus,
      reason: !monitorReady
        ? "DB monitor evidence is missing or empty. Do not escalate."
        : monitorError
          ? "DB monitor lifecycle failed. Do not escalate."
          : evaluationError
            ? "Evaluator rejected this tier. Investigate before any higher tier."
            : "k6 exited non-zero. Do not escalate.",
      k6ExitedNonZero: Boolean(k6Error),
      monitorFailed: Boolean(monitorError) || !monitorReady,
      evaluatorFailed: Boolean(evaluationError),
      evidence: { before, after, summary, monitor, evaluation },
    }, null, 2));

    if (evaluationError) throw evaluationError;
    if (k6Error) throw k6Error;
    if (monitorError) throw monitorError;
    throw new Error("DB monitor evidence is missing or empty.");
  }

  console.log(JSON.stringify({
    action: "PERFORMANCE_TIER_ELIGIBLE_FOR_REVIEW",
    vus,
    evidence: { before, after, summary, monitor, evaluation },
    nextStep: "Review evidence. A human/agent may consider the next tier; this runner will not start it.",
  }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Performance tier runner failed.");
  process.exit(typeof (error as { exitCode?: unknown })?.exitCode === "number"
    ? Number((error as { exitCode: number }).exitCode)
    : 1);
});
