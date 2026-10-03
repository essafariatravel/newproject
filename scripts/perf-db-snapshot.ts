import "./lib/load-env";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";
import { databasePoolConfig } from "../src/lib/database-config";
import { assertSafePerfTarget, safeTargetSummary } from "./perf-safety";

function safeLabel(value: string): string {
  const cleaned = value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned.slice(0, 60) || "snapshot";
}

async function main() {
  const target = assertSafePerfTarget();
  const pool = new Pool({ ...databasePoolConfig(process.env), max: 1 });
  const label = safeLabel(process.env.PERF_LABEL ?? "snapshot");
  const capturedAt = new Date();
  const stamp = capturedAt.toISOString().replace(/[:.]/g, "-");
  const output = resolve(process.env.PERF_SNAPSHOT_FILE ?? `perf/results/${stamp}-${label}.json`);

  try {
    const client = await pool.connect();
    try {
      const connections = await client.query(`
        select coalesce(usename,'') as usename,
               coalesce(application_name,'') as application_name,
               coalesce(state,'') as state,
               count(*)::int as connections
          from pg_stat_activity
         where datname=current_database()
         group by usename, application_name, state
         order by connections desc, application_name
      `);

      const databaseStats = await client.query(`
        select datname,
               xact_commit,
               xact_rollback,
               blks_read,
               blks_hit,
               tup_returned,
               tup_fetched,
               tup_inserted,
               tup_updated,
               tup_deleted,
               conflicts,
               deadlocks,
               temp_files,
               temp_bytes
          from pg_stat_database
         where datname=current_database()
      `);

      const tableStats = await client.query(`
        select relname,
               seq_scan,
               idx_scan,
               n_live_tup,
               n_dead_tup,
               pg_total_relation_size(relid) as total_bytes
          from pg_stat_user_tables
         where schemaname=$1
         order by n_live_tup desc, relname
      `, [target.schema]);

      const indexStats = await client.query(`
        select relname,
               indexrelname,
               idx_scan,
               idx_tup_read,
               idx_tup_fetch
          from pg_stat_user_indexes
         where schemaname=$1
         order by relname, idx_scan desc, indexrelname
      `, [target.schema]);

      const locks = await client.query(`
        select count(*)::int as waiting
          from pg_stat_activity
         where datname=current_database()
           and wait_event_type='Lock'
      `);

      let statements: unknown[] = [];
      const hasStatements = await client.query<{ present: boolean }>(
        "select exists(select 1 from pg_extension where extname='pg_stat_statements') as present",
      );
      if (hasStatements.rows[0]?.present) {
        const result = await client.query(`
          select queryid::text,
                 calls,
                 round(total_exec_time::numeric,3) as total_exec_ms,
                 round(mean_exec_time::numeric,3) as mean_exec_ms,
                 round(max_exec_time::numeric,3) as max_exec_ms,
                 rows,
                 left(regexp_replace(query, '\\s+', ' ', 'g'), 1000) as normalized_query
            from pg_stat_statements
           where query ilike $1
           order by total_exec_time desc
           limit 75
        `, [`%${target.schema}%`]);
        statements = result.rows;
      }

      const result = {
        capturedAt: capturedAt.toISOString(),
        label,
        target: safeTargetSummary(target),
        connections: connections.rows,
        databaseStats: databaseStats.rows,
        waitingLocks: locks.rows[0]?.waiting ?? 0,
        tableStats: tableStats.rows,
        indexStats: indexStats.rows,
        pgStatStatements: statements,
      };

      await mkdir(resolve("perf/results"), { recursive: true });
      await writeFile(output, JSON.stringify(result, null, 2), { mode: 0o600 });
      console.log(JSON.stringify({
        ok: true,
        output,
        label,
        target: safeTargetSummary(target),
        waitingLocks: result.waitingLocks,
        statementRows: statements.length,
      }, null, 2));
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Performance DB snapshot failed.");
  process.exit(1);
});
