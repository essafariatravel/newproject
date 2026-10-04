import "./lib/load-env";
import { Pool } from "pg";
import { databasePoolConfig } from "../src/lib/database-config";
import { assertSafePerfTarget, perfTable, safeTargetSummary } from "./perf-safety";

type HealthResponse = {
  ok?: boolean;
  deployment?: { environment?: string | null };
};

async function main() {
  const target = assertSafePerfTarget();
  if (!target.baseUrl) throw new Error("BASE_URL is required for performance preflight.");

  const healthResponse = await fetch(`${target.baseUrl}/api/health`, {
    headers: { "user-agent": "essafaria-performance-preflight" },
    cache: "no-store",
  });
  if (!healthResponse.ok) {
    throw new Error(`Preview health endpoint returned HTTP ${healthResponse.status}.`);
  }
  const health = (await healthResponse.json()) as HealthResponse;
  if (health.deployment?.environment === "production") {
    throw new Error("Health endpoint identifies the deployment as Production.");
  }
  if (health.ok !== true) {
    throw new Error("Preview health endpoint is not ready.");
  }

  const pool = new Pool({ ...databasePoolConfig(process.env), max: 1 });
  try {
    const client = await pool.connect();
    try {
      const counts = await client.query<Record<string, string>>(`
        select
          (select count(*)::text from ${perfTable("agencies")}) as agencies,
          (select count(*)::text from ${perfTable("users")}) as users,
          (select count(*)::text from ${perfTable("applications")}) as applications,
          (select count(*)::text from ${perfTable("documents")}) as documents,
          (select count(*)::text from ${perfTable("wallet_transactions")}) as wallet_transactions,
          (select count(*)::text from ${perfTable("notifications")}) as notifications,
          (select count(*)::text from ${perfTable("communications")}) as communications,
          (select count(*)::text from ${perfTable("audit_logs")}) as audit_logs
      `);

      const extensions = await client.query<{ extname: string }>(
        "select extname from pg_extension where extname = 'pg_stat_statements'",
      );

      const identities = await client.query<{ role: string; count: string }>(`
        select role, count(*)::text as count
        from ${perfTable("users")}
        where lower(email) like 'perf.%@load.example'
        group by role
        order by role
      `);

      const migrations = await client.query<{ name: string }>(
        `select name from ${perfTable("schema_migrations")} order by name`,
      );

      console.log(JSON.stringify({
        ok: true,
        target: safeTargetSummary(target),
        health: {
          status: healthResponse.status,
          deploymentEnvironment: health.deployment?.environment ?? null,
        },
        counts: counts.rows[0] ?? {},
        pgStatStatementsAvailable: extensions.rowCount === 1,
        syntheticIdentities: identities.rows,
        migrationCount: migrations.rowCount,
        migrationLast: migrations.rows.at(-1)?.name ?? null,
      }, null, 2));
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Performance preflight failed.");
  process.exit(1);
});
