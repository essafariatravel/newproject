import "./lib/load-env";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Pool } from "pg";
import { databasePoolConfig } from "../src/lib/database-config";
import { assertSafePerfTarget, safeTargetSummary } from "./perf-safety";

function intEnv(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} must be ${min}..${max}.`);
  return value;
}
function sleep(ms: number) { return new Promise((resolveSleep) => setTimeout(resolveSleep, ms)); }

async function main() {
  const target = assertSafePerfTarget();
  const intervalMs = intEnv("PERF_MONITOR_INTERVAL_MS", 1000, 250, 10000);
  const durationSeconds = intEnv("PERF_MONITOR_SECONDS", 600, 5, 14400);
  const output = resolve(process.env.PERF_MONITOR_OUTPUT ?? `perf/results/db-monitor-${Date.now()}.json`);
  const readyFile = process.env.PERF_MONITOR_READY_FILE;
  const stopFile = process.env.PERF_MONITOR_STOP_FILE;
  const pool = new Pool({ ...databasePoolConfig(process.env), max: 1 });
  const samples: Array<Record<string, unknown>> = [];
  let stopRequested = false;
  let completionObserved = false;
  let samplingFailed = false;
  const requestStop = () => { stopRequested = true; };
  process.once("SIGTERM", requestStop);
  process.once("SIGINT", requestStop);

  const startedAtMs = Date.now();
  const deadlineMs = startedAtMs + durationSeconds * 1000;

  try {
    while (!stopRequested && Date.now() < deadlineMs) {
      if (stopFile) {
        try { await stat(stopFile); completionObserved = true; stopRequested = true; break; }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      }
      try {
        const client = await pool.connect();
        try {
          const activity = await client.query<{
            state: string;
            wait_event_type: string | null;
            wait_event: string | null;
            connections: number;
          }>(`
            select coalesce(state,'') state, wait_event_type, wait_event, count(*)::int connections
              from pg_stat_activity
             where datname=current_database()
             group by state, wait_event_type, wait_event
             order by connections desc
          `);
          const totals = await client.query<{
            active: number;
            idle: number;
            waiting: number;
            total: number;
          }>(`
            select
              count(*) filter (where state='active')::int active,
              count(*) filter (where state='idle')::int idle,
              count(*) filter (where wait_event_type is not null)::int waiting,
              count(*)::int total
            from pg_stat_activity where datname=current_database()
          `);
          const locks = await client.query<{ waiting_locks: number }>(`
            select count(*)::int waiting_locks
              from pg_stat_activity
             where datname=current_database() and wait_event_type='Lock'
          `);
          samples.push({
            at: new Date().toISOString(),
            ...(totals.rows[0] ?? {}),
            waitingLocks: locks.rows[0]?.waiting_locks ?? 0,
            activity: activity.rows,
          });
          if (samples.length === 1 && readyFile) await writeFile(readyFile, samples[0]!.at as string, {mode:0o600});
        } finally {
          client.release();
        }
      } catch {
        samplingFailed = true;
        break;
      }

      const remainingMs = deadlineMs - Date.now();
      if (remainingMs > 0 && !stopRequested) {
        await sleep(Math.min(intervalMs, remainingMs));
      }
    }
  } finally {
    process.removeListener("SIGTERM", requestStop);
    process.removeListener("SIGINT", requestStop);
    try {
      await pool.end();
    } catch {
      samplingFailed = true;
    }

    const number = (row: Record<string, unknown>, key: string) => Number(row[key] ?? 0);
    const summary = {
      samples: samples.length,
      maxConnections: Math.max(0, ...samples.map((s) => number(s, "total"))),
      maxActive: Math.max(0, ...samples.map((s) => number(s, "active"))),
      maxIdle: Math.max(0, ...samples.map((s) => number(s, "idle"))),
      maxWaiting: Math.max(0, ...samples.map((s) => number(s, "waiting"))),
      maxWaitingLocks: Math.max(0, ...samples.map((s) => number(s, "waitingLocks"))),
    };
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, JSON.stringify({
      generatedAt: new Date().toISOString(),
      target: safeTargetSummary(target),
      intervalMs,
      durationSeconds,
      elapsedMs: Date.now() - startedAtMs,
      stoppedEarly: stopRequested,
      completionObserved,
      watchdogExpired: !stopRequested && Date.now() >= deadlineMs,
      samplingFailed,
      summary,
      samples,
    }, null, 2), { mode: 0o600 });
    console.log(JSON.stringify({ ok: !samplingFailed && (!stopFile || completionObserved), output, summary }, null, 2));
  }

  if (samplingFailed || samples.length === 0) throw new Error("DB monitor sampling failed; evidence was written but the tier must fail closed.");
  if (stopFile && !completionObserved) throw new Error("DB monitor stopped before owned workload completion; evidence was written but the tier must fail closed.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "DB monitor failed.");
  process.exit(1);
});
