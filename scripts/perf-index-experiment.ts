import "./lib/load-env";
import { performance } from "node:perf_hooks";
import { Pool, type PoolClient } from "pg";
import { databasePoolConfig } from "../src/lib/database-config";
import { assertSafePerfTarget, perfTable, safeTargetSummary } from "./perf-safety";

function percentile(values: number[], pct: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((pct / 100) * sorted.length) - 1));
  return sorted[index] ?? Number.NaN;
}

async function timed(client: PoolClient, sql: string, params: unknown[], repeats: number) {
  const samples: number[] = [];
  let rows = 0;
  for (let i = 0; i < repeats; i++) {
    const started = performance.now();
    const result = await client.query(sql, params);
    samples.push(performance.now() - started);
    rows = result.rowCount ?? result.rows.length;
  }
  return {
    p50Ms: percentile(samples, 50),
    p95Ms: percentile(samples, 95),
    p99Ms: percentile(samples, 99),
    minMs: Math.min(...samples),
    maxMs: Math.max(...samples),
    rows,
  };
}

async function explain(client: PoolClient, sql: string, params: unknown[]) {
  const result = await client.query(`explain (analyze, buffers, format json) ${sql}`, params);
  return result.rows[0]?.["QUERY PLAN"] ?? null;
}

function speedup(before: number, after: number) {
  return Number.isFinite(before) && Number.isFinite(after) && after > 0 ? before / after : Number.NaN;
}

async function main() {
  const target = assertSafePerfTarget();
  if (target.remote) {
    throw new Error("Index experiments are disposable-local only. This script refuses every remote database, including Preview.");
  }
  const repeats = Number(process.env.PERF_INDEX_EXPERIMENT_REPEATS ?? "15");
  if (!Number.isInteger(repeats) || repeats < 5 || repeats > 50) {
    throw new Error("PERF_INDEX_EXPERIMENT_REPEATS must be an integer between 5 and 50.");
  }

  const pool = new Pool({ ...databasePoolConfig(process.env), max: 1 });
  try {
    const client = await pool.connect();
    try {
      const agent = await client.query<{ id: string }>(
        `select id from ${perfTable("users")} where lower(email)='perf.agent@load.example' limit 1`
      );
      const userId = agent.rows[0]?.id;
      if (!userId) throw new Error("PERF Visa Agent identity is missing.");

      const experiments = [];

      // Experiment 1 — exact production unread notification poll shape.
      {
        const sql = `select count(*) from ${perfTable("notifications")} where user_id=$1 and read_at is null`;
        const indexName = "perf_exp_notifications_unread_user_idx";
        await client.query(`drop index if exists ${target.schema}.${indexName}`);
        await client.query(`analyze ${perfTable("notifications")}`);
        const before = await timed(client, sql, [userId], repeats);
        const beforePlan = await explain(client, sql, [userId]);
        try {
          await client.query(`create index ${indexName} on ${perfTable("notifications")} (user_id) where read_at is null`);
          await client.query(`analyze ${perfTable("notifications")}`);
          await timed(client, sql, [userId], 3);
          const after = await timed(client, sql, [userId], repeats);
          const afterPlan = await explain(client, sql, [userId]);
          const ratio = speedup(before.p95Ms, after.p95Ms);
          experiments.push({
            id: "notifications_unread_user",
            exactProductionShape: true,
            before,
            after,
            p95Speedup: ratio,
            verdict: before.p95Ms >= 5 && ratio >= 2 ? "PROVEN_LOCAL_CANDIDATE" : "NO_STRONG_LOCAL_BENEFIT",
            candidateSql: `create index concurrently if not exists notifications_unread_user_idx on ${target.schema}.notifications (user_id) where read_at is null;`,
            beforePlan,
            afterPlan,
          });
        } finally {
          await client.query(`drop index if exists ${target.schema}.${indexName}`);
        }
      }

      // Experiment 2 — exact staff recent-communications inbox ordering.
      {
        const sql = `
          select c.id
            from ${perfTable("communications")} c
            join ${perfTable("users")} u on u.id=c.author_id
            join ${perfTable("applications")} a on a.id=c.application_id
           order by c.created_at desc
           limit 30
        `;
        const indexName = "perf_exp_communications_created_idx";
        await client.query(`drop index if exists ${target.schema}.${indexName}`);
        await client.query(`analyze ${perfTable("communications")}`);
        const before = await timed(client, sql, [], repeats);
        const beforePlan = await explain(client, sql, []);
        try {
          await client.query(`create index ${indexName} on ${perfTable("communications")} (created_at desc)`);
          await client.query(`analyze ${perfTable("communications")}`);
          await timed(client, sql, [], 3);
          const after = await timed(client, sql, [], repeats);
          const afterPlan = await explain(client, sql, []);
          const ratio = speedup(before.p95Ms, after.p95Ms);
          experiments.push({
            id: "communications_created",
            exactProductionShape: true,
            before,
            after,
            p95Speedup: ratio,
            verdict: before.p95Ms >= 5 && ratio >= 2 ? "PROVEN_LOCAL_CANDIDATE" : "NO_STRONG_LOCAL_BENEFIT",
            candidateSql: `create index concurrently if not exists communications_created_idx on ${target.schema}.communications (created_at desc);`,
            beforePlan,
            afterPlan,
          });
        } finally {
          await client.query(`drop index if exists ${target.schema}.${indexName}`);
        }
      }

      console.log(JSON.stringify({
        generatedAt: new Date().toISOString(),
        target: safeTargetSummary(target),
        policy: "Disposable-local A/B experiment only. All temporary indexes are dropped before exit. Results justify candidates for hosted validation; they do not authorize a remote migration.",
        repeats,
        experiments,
      }, null, 2));
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Index experiment failed.");
  process.exit(1);
});
