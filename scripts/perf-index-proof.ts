import "./lib/load-env";
import { Pool } from "pg";
import { databasePoolConfig } from "../src/lib/database-config";
import { assertSafePerfTarget, perfTable, safeTargetSummary } from "./perf-safety";

function localOnly() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is required.");
  const url = new URL(raw);
  const host = url.hostname.toLowerCase();
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) {
    throw new Error("Index proof is restricted to disposable localhost PostgreSQL.");
  }
  if (process.env.PERF_ALLOW_LOCAL_INDEX_PROOF !== "YES") {
    throw new Error("Set PERF_ALLOW_LOCAL_INDEX_PROOF=YES for the disposable local proof.");
  }
}

async function main() {
  const target = assertSafePerfTarget();
  localOnly();
  const candidate = String(process.env.PERF_INDEX_CANDIDATE ?? "");
  if (candidate !== "notifications_unread_user") {
    throw new Error("Only the measured notifications_unread_user candidate is allowed by this proof tool.");
  }

  const table = perfTable("notifications");
  const index = "notifications_unread_user_perf_proof_idx";
  const pool = new Pool({ ...databasePoolConfig(process.env), max: 1 });
  try {
    const client = await pool.connect();
    try {
      await client.query(`drop index if exists "${target.schema}".${index}`);
      const before = await client.query<{ count: string }>(
        `select count(*)::text count from ${table} where read_at is null`,
      );
      const started = performance.now();
      await client.query(
        `create index ${index} on ${table} (user_id) where read_at is null`,
      );
      const buildMs = performance.now() - started;
      const definition = await client.query<{ indexdef: string }>(
        `select indexdef from pg_indexes where schemaname=$1 and indexname=$2`,
        [target.schema, index],
      );
      console.log(JSON.stringify({
        ok: true,
        target: safeTargetSummary(target),
        candidate,
        unreadRows: Number(before.rows[0]?.count ?? 0),
        buildMs,
        index: definition.rows[0]?.indexdef ?? null,
        warning: "Disposable proof index only. Do not run this tool against Preview or Production.",
      }, null, 2));
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Index proof failed.");
  process.exit(1);
});
