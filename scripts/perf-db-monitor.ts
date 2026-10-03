import "./lib/load-env";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";
import { databasePoolConfig } from "../src/lib/database-config";
import { assertSafePerfTarget, safeTargetSummary } from "./perf-safety";

function intEnv(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} must be ${min}..${max}.`);
  return value;
}
function sleep(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function main() {
  const target = assertSafePerfTarget();
  const intervalMs = intEnv("PERF_MONITOR_INTERVAL_MS", 1000, 250, 10000);
  const durationSeconds = intEnv("PERF_MONITOR_SECONDS", 600, 5, 14400);
  const output = resolve(process.env.PERF_MONITOR_OUTPUT ?? `perf/results/db-monitor-${Date.now()}.json`);
  const pool = new Pool({ ...databasePoolConfig(process.env), max: 1 });
  const samples: Array<Record<string, unknown>> = [];

  try {
    for (let i = 0; i < Math.ceil((durationSeconds * 1000) / intervalMs); i++) {
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
      } finally {
        client.release();
      }
      if (i + 1 < Math.ceil((durationSeconds * 1000) / intervalMs)) await sleep(intervalMs);
    }
  } finally {
    await pool.end();
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
  await mkdir(resolve("perf/results"), { recursive: true });
  await writeFile(output, JSON.stringify({
    generatedAt: new Date().toISOString(),
    target: safeTargetSummary(target),
    intervalMs,
    durationSeconds,
    summary,
    samples,
  }, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ ok: true, output, summary }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "DB monitor failed.");
  process.exit(1);
});
