import { pool } from "@/lib/db";
import { databaseSchema } from "@/lib/database-schema";
import { logErrorOnce } from "@/lib/observability";

export interface DatabaseObservabilitySnapshot {
  status: "healthy" | "degraded" | "unavailable";
  checkedAt: string;
  connections: {
    max: number;
    total: number;
    active: number;
    idle: number;
    activeWaiting: number;
    activeLockWaiting: number;
    utilizationPct: number;
  } | null;
  transactions: {
    longOver60s: number;
    waitingLocks: number;
    deadlocksSinceReset: number;
    rollbacksSinceReset: number;
    statsReset: string | null;
  } | null;
  storage: {
    databaseBytes: number;
    schemaBytes: number;
    tempFilesSinceReset: number;
    tempBytesSinceReset: number;
  } | null;
  statements: {
    pgStatStatementsEnabled: boolean;
    meanOver500ms: number | null;
    maxMeanExecMs: number | null;
    maxSingleExecMs: number | null;
    applicationMeanOver500ms: number | null;
    applicationMaxMeanExecMs: number | null;
    applicationMaxSingleExecMs: number | null;
  } | null;
}

/** Read-only DB health snapshot. Never returns SQL text, credentials, identifiers or PII. */
export async function databaseObservabilitySnapshot(): Promise<DatabaseObservabilitySnapshot> {
  const checkedAt = new Date().toISOString();
  try {
    const activity = await pool.query<{
      max_connections: number | string;
      total_connections: number | string;
      active_connections: number | string;
      idle_connections: number | string;
      active_waiting: number | string;
      active_lock_waiting: number | string;
      long_transactions: number | string;
    }>(`
      select
        current_setting('max_connections')::int as max_connections,
        count(*) filter (where datname=current_database())::int as total_connections,
        count(*) filter (where datname=current_database() and state='active')::int as active_connections,
        count(*) filter (where datname=current_database() and state='idle')::int as idle_connections,
        count(*) filter (
          where datname=current_database()
            and state='active'
            and wait_event is not null
            and coalesce(wait_event_type,'') <> 'Client'
        )::int as active_waiting,
        count(*) filter (
          where datname=current_database()
            and state='active'
            and wait_event_type='Lock'
        )::int as active_lock_waiting,
        count(*) filter (
          where datname=current_database()
            and xact_start is not null
            and now()-xact_start > interval '60 seconds'
        )::int as long_transactions
      from pg_stat_activity
    `);

    const lockRows = await pool.query<{ waiting_locks: number | string }>(
      "select count(*) filter (where not granted)::int as waiting_locks from pg_locks",
    );

    const dbStat = await pool.query<{
      deadlocks: number | string;
      xact_rollback: number | string;
      temp_files: number | string;
      temp_bytes: number | string;
      stats_reset: Date | string | null;
    }>(`
      select deadlocks, xact_rollback, temp_files, temp_bytes, stats_reset
      from pg_stat_database
      where datname=current_database()
    `);

    const sizeRows = await pool.query<{
      database_bytes: number | string;
      schema_bytes: number | string;
    }>(
      `select
         pg_database_size(current_database())::bigint as database_bytes,
         coalesce(sum(pg_total_relation_size(c.oid)),0)::bigint as schema_bytes
       from pg_class c
       join pg_namespace n on n.oid=c.relnamespace
       where n.nspname=$1 and c.relkind in ('r','m','i','t')`,
      [databaseSchema()],
    );

    const ext = await pool.query<{ namespace: string }>(
      `select n.nspname as namespace
         from pg_catalog.pg_extension e
         join pg_catalog.pg_namespace n on n.oid=e.extnamespace
        where e.extname='pg_stat_statements'`,
    );
    const extension = ext.rows[0];
    const enabled = Boolean(extension);

    let statementStats: {
      mean_over_500ms: number | string;
      max_mean_exec_ms: number | string;
      max_single_exec_ms: number | string;
      application_mean_over_500ms: number | string;
      application_max_mean_exec_ms: number | string;
      application_max_single_exec_ms: number | string;
    } | null = null;
    if (extension) {
      // Extension objects may live outside the application search path.
      // Quote the catalog-derived identifier without changing that safety boundary.
      const statementView = `"${extension.namespace.replaceAll('"', '""')}"."pg_stat_statements"`;
      const stmt = await pool.query<{
        mean_over_500ms: number | string;
        max_mean_exec_ms: number | string;
        max_single_exec_ms: number | string;
        application_mean_over_500ms: number | string;
        application_max_mean_exec_ms: number | string;
        application_max_single_exec_ms: number | string;
      }>(`
        select
          count(*) filter (where mean_exec_time > 500)::int as mean_over_500ms,
          coalesce(max(mean_exec_time),0)::numeric(12,2) as max_mean_exec_ms,
          coalesce(max(max_exec_time),0)::numeric(12,2) as max_single_exec_ms,
          count(*) filter (
            where mean_exec_time > 500
              and query ilike $1
              and lower(ltrim(query)) ~ '^(select|insert|update|delete|with)\\b'
              and query not ilike $2
              and query not ilike $3
              and query not ilike '%schema_migrations%'
              and query not ilike '%information_schema%'
              and query not ilike '%pg_catalog%'
              and query not ilike '%pg_tables%'
          )::int as application_mean_over_500ms,
          coalesce(max(mean_exec_time) filter (
            where query ilike $1
              and lower(ltrim(query)) ~ '^(select|insert|update|delete|with)\\b'
              and query not ilike $2
              and query not ilike $3
              and query not ilike '%schema_migrations%'
              and query not ilike '%information_schema%'
              and query not ilike '%pg_catalog%'
              and query not ilike '%pg_tables%'
          ),0)::numeric(12,2) as application_max_mean_exec_ms,
          coalesce(max(max_exec_time) filter (
            where query ilike $1
              and lower(ltrim(query)) ~ '^(select|insert|update|delete|with)\\b'
              and query not ilike $2
              and query not ilike $3
              and query not ilike '%schema_migrations%'
              and query not ilike '%information_schema%'
              and query not ilike '%pg_catalog%'
              and query not ilike '%pg_tables%'
          ),0)::numeric(12,2) as application_max_single_exec_ms
        from ${statementView}
      `, [
        `%${databaseSchema()}%`,
        `%${databaseSchema()}_backup_%`,
        `%${databaseSchema()}_restorecheck_%`,
      ]);
      statementStats = stmt.rows[0] ?? null;
    }

    const a = activity.rows[0]!;
    const d = dbStat.rows[0]!;
    const z = sizeRows.rows[0]!;
    const maxConnections = Number(a.max_connections);
    const totalConnections = Number(a.total_connections);
    const utilizationPct = maxConnections > 0
      ? Math.round((totalConnections / maxConnections) * 1000) / 10
      : 0;
    const waitingLocks = Number(lockRows.rows[0]?.waiting_locks ?? 0);
    const activeWaiting = Number(a.active_waiting);
    const longTransactions = Number(a.long_transactions);

    const degraded =
      utilizationPct >= 70 ||
      waitingLocks > 0 ||
      activeWaiting > 0 ||
      longTransactions > 0;

    return {
      status: degraded ? "degraded" : "healthy",
      checkedAt,
      connections: {
        max: maxConnections,
        total: totalConnections,
        active: Number(a.active_connections),
        idle: Number(a.idle_connections),
        activeWaiting,
        activeLockWaiting: Number(a.active_lock_waiting),
        utilizationPct,
      },
      transactions: {
        longOver60s: longTransactions,
        waitingLocks,
        deadlocksSinceReset: Number(d.deadlocks),
        rollbacksSinceReset: Number(d.xact_rollback),
        statsReset: d.stats_reset ? new Date(d.stats_reset).toISOString() : null,
      },
      storage: {
        databaseBytes: Number(z.database_bytes),
        schemaBytes: Number(z.schema_bytes),
        tempFilesSinceReset: Number(d.temp_files),
        tempBytesSinceReset: Number(d.temp_bytes),
      },
      statements: {
        pgStatStatementsEnabled: enabled,
        meanOver500ms: statementStats ? Number(statementStats.mean_over_500ms) : null,
        maxMeanExecMs: statementStats ? Number(statementStats.max_mean_exec_ms) : null,
        maxSingleExecMs: statementStats ? Number(statementStats.max_single_exec_ms) : null,
        applicationMeanOver500ms: statementStats ? Number(statementStats.application_mean_over_500ms) : null,
        applicationMaxMeanExecMs: statementStats ? Number(statementStats.application_max_mean_exec_ms) : null,
        applicationMaxSingleExecMs: statementStats ? Number(statementStats.application_max_single_exec_ms) : null,
      },
    };
  } catch (error) {
    logErrorOnce("database.observability_snapshot.failed", error, {
      severity: "error",
      classification: "BUSINESS_FAILURE",
      result: "technical_failed",
      action: "database_observability_snapshot",
    });
    return {
      status: "unavailable",
      checkedAt,
      connections: null,
      transactions: null,
      storage: null,
      statements: null,
    };
  }
}
