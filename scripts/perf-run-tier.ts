import "./lib/load-env";
import { mkdir, readFile, rm, stat,writeFile } from "node:fs/promises";
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
  if (!child) return;
  if (child.exitCode !== null) {
    if (child.exitCode !== 0) throw new Error(`DB monitor exited with code ${child.exitCode}.`);
    return;
  }
  // A completion marker lets the directly owned monitor flush its evidence on
  // Windows and Linux alike, without killing an npm wrapper before its child.
  await new Promise<void>((resolveDone, reject) => {
    const timer = setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
      reject(new Error("DB monitor did not flush evidence within 30 seconds after k6."));
    }, 30000);
    child.once("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolveDone();
      else reject(new Error(`DB monitor exited with code ${code ?? "unknown"}.`));
    });
  });
}

async function waitForMonitorReady(file: string, child: ChildProcess) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await evidenceFileReady(file)) return;
    if (child.exitCode !== null) throw new Error("DB monitor exited before its first sample.");
    await new Promise(resolveWait => setTimeout(resolveWait, 250));
  }
  throw new Error("DB monitor did not record its first sample before traffic.");
}

async function evidenceFileReady(path: string): Promise<boolean> {
  try {
    return (await stat(path)).size > 0;
  } catch {
    return false;
  }
}

async function main() {
  // Block hosted targets before DB snapshots, preflight probes, or any k6 workload.
  const requestedBaseUrl = String(process.env.BASE_URL || "").trim().replace(/\/+$/, "");
  if (!/^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i.test(requestedBaseUrl)) {
    throw new Error("HOSTED_K6_DISABLED: performance tiers require a local loopback BASE_URL.");
  }
  const target = assertSafePerfTarget();
  const vus = intEnv("PERF_VUS", 10, 1, 1000);
  if (!ALLOWED_VUS.has(vus)) throw new Error("PERF_VUS must be one of 10, 50, 100, 250, 500, 1000.");
  const kind = process.env.PERF_RUN_KIND ?? "TIER";
  if (!["TIER", "SOAK", "SPIKE"].includes(kind)) throw new Error("Unknown performance run kind.");
  if (kind === "SOAK" && (![100, 250].includes(vus) || process.env.PERF_TIER_HOLD_MINUTES !== "120")) {
    throw new Error("Soak requires a proven 100/250-VU tier and a two-hour hold.");
  }
  if (kind === "SPIKE" && vus !== 250) throw new Error("The spike profile requires a proven 250-VU tier.");
  const holdMinutes = kind === "SOAK" ? 120 : kind === "SPIKE" ? 5 : intEnv("PERF_TIER_HOLD_MINUTES", 5, 1, 25);
  const rampMinutes = vus <= 10 ? 1 : vus <= 100 ? 5 : 10;
  const expectedDurationSeconds = kind === "SPIKE" ? 22 * 60 : (rampMinutes + holdMinutes + 1) * 60;
  const label = String(process.env.PERF_RUN_LABEL ?? `${vus}vu`).replace(/[^a-zA-Z0-9_-]/g, "-");
  const dir = resolve(process.env.PERF_RUN_DIR ?? `perf/results/run-${label}`);
  await mkdir(dir, { recursive: true });
  const provenance={sha:process.env.EXPECTED_RELEASE_SHA??process.env.GITHUB_SHA??null,baseUrl:target.baseUrl,schema:target.schema,kind,vus,holdMinutes,expectedDurationSeconds,startedAt:new Date().toISOString()};
  const tierFile=resolve(dir,"tier.json");
  await writeFile(tierFile,JSON.stringify({...provenance,status:"IN_PROGRESS"},null,2));

  const before = resolve(dir, "db-before.json");
  const after = resolve(dir, "db-after.json");
  const summary = resolve(dir, "k6-summary.json");
  const monitor = resolve(dir, "db-monitor.json");
  const evaluation = resolve(dir, "evaluation.json");
  // The stop marker owns normal completion. This is only a bounded watchdog:
  // allow first-sample startup (30s), k6 setup (60s), graceful drain (30s),
  // teardown (60s), and process launch/summary/flush overhead (30s).
  const monitorSeconds = expectedDurationSeconds + 30 + 60 + 30 + 60 + 30;
  const monitorReadyFile = resolve(dir, "monitor.ready");
  const monitorStopFile = resolve(dir, "monitor.stop");
  await rm(monitorReadyFile, { force: true });
  await rm(monitorStopFile, { force: true });

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PERF_VUS: String(vus),
    PERF_PROFILE: kind === "SPIKE" ? "spike" : "tier",
    PERF_HOLD: `${holdMinutes}m`,
    PERF_RAMP: `${rampMinutes}m`,
    K6_SETUP_TIMEOUT: "60s",
    K6_TEARDOWN_TIMEOUT: "60s",
    PERF_SUMMARY: summary,
    // k6 open() resolves relative paths from the script directory, unlike Node.
    PERF_SESSION_FILE: resolve(process.env.PERF_SESSION_FILE ?? "perf/.runtime/sessions.json"),
    PERF_APPLICATION_MANIFEST: resolve(process.env.PERF_APPLICATION_MANIFEST ?? "perf/.runtime/application-manifest.json"),
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
  let k6StartedAt: string | null = null;
  let k6FinishedAt: string | null = null;
  try {
    monitorProcess = start(process.execPath, ["--import", "tsx", resolve("scripts/perf-db-monitor.ts")], {
      ...env,
      PERF_MONITOR_SECONDS: String(monitorSeconds),
      PERF_MONITOR_INTERVAL_MS: process.env.PERF_MONITOR_INTERVAL_MS ?? "1000",
      PERF_MONITOR_OUTPUT: monitor,
      PERF_MONITOR_READY_FILE: monitorReadyFile,
      PERF_MONITOR_STOP_FILE: monitorStopFile,
    });
    await waitForMonitorReady(monitorReadyFile, monitorProcess);

    try {
      k6StartedAt = new Date().toISOString();
      run("npm", ["run", "perf:k6"], env);
    } catch (error) {
      // Preserve all post-run evidence even when k6 itself exits non-zero.
      k6Error = error;
    } finally {
      k6FinishedAt = new Date().toISOString();
    }
  } finally {
    try {
      try { await writeFile(monitorStopFile, "stop", {mode:0o600}); }
      finally { await stop(monitorProcess); }
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
  if (monitorReady && k6StartedAt && k6FinishedAt) {
    try {
      const data = JSON.parse(await readFile(monitor, "utf8"));
      const first = Date.parse(data.samples?.[0]?.at);
      const last = Date.parse(data.samples?.at(-1)?.at);
      if (data.samplingFailed || ![first,last].every(Number.isFinite) ||
          first > Date.parse(k6StartedAt) || last < Date.parse(k6FinishedAt) - Math.max(2000, 2 * Number(data.intervalMs || 1000))) {
        throw new Error("Database monitoring does not cover the complete workload.");
      }
    } catch (error) { monitorError = error; }
  }
  if (monitorError || !monitorReady || evaluationError || k6Error) {
    await writeFile(tierFile,JSON.stringify({...provenance,k6StartedAt,k6FinishedAt,status:"FAIL",finishedAt:new Date().toISOString()},null,2));
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

  await writeFile(tierFile,JSON.stringify({...provenance,k6StartedAt,k6FinishedAt,status:"PASS",finishedAt:new Date().toISOString()},null,2));
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
