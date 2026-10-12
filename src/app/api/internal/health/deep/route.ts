import { NextResponse } from "next/server";
import { authorizeOperatorRequest } from "@/lib/operator-auth";
import { getTableColumns, getTableName, is, Table } from "drizzle-orm";
import { Pool } from "pg";
import * as applicationSchema from "@/db/schema";
import { databasePoolConfig } from "@/lib/database-config";
import { qualifiedTable } from "@/lib/database-schema";
import { checkReleaseProtections } from "@/lib/release-protections";

export const dynamic = "force-dynamic";

const REQUIRED_TABLES = ["users", "site_settings", "visa_types", "countries", "schema_migrations"] as const;


/**
 * Protected deep diagnostics for operators/CI only.
 *
 * It reports structural health but never the database hostname, schema name,
 * connection URI, credentials, private URLs, PII, or document contents.
 */
export async function GET(request: Request) {
  const auth = authorizeOperatorRequest(request);
  if (auth === "disabled") {
    return NextResponse.json(
      { status: "not_found" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (auth === "denied") {
    return NextResponse.json(
      { status: "unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const report = {
    status: "unavailable" as "healthy" | "degraded" | "unavailable",
    service: "essafaria-visa-os",
    environment: process.env.VERCEL_ENV ?? null,
    releaseSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    database: {
      connected: false,
      latencyMs: null as number | null,
      error: false,
    },
    schema: {
      columnsValid: false,
      requiredTables: {} as Record<string, boolean>,
      migrationLedger: [] as string[],
    },
  };

  const pool = new Pool({ ...databasePoolConfig(), max: 1 });
  const startedAt = Date.now();
  try {
    const client = await pool.connect();
    report.database.connected = true;
    report.database.latencyMs = Date.now() - startedAt;
    try {
      for (const table of REQUIRED_TABLES) {
        const res = await client.query("select to_regclass($1) is not null as present", [
          qualifiedTable(table),
        ]);
        report.schema.requiredTables[table] = Boolean(res.rows[0]?.present);
      }

      if (report.schema.requiredTables.schema_migrations) {
        const ledger = await client.query(
          `select name from ${qualifiedTable("schema_migrations")} order by name`,
        );
        report.schema.migrationLedger = ledger.rows.map((row) => String(row.name));
      }

      for (const table of Object.values(applicationSchema)) {
        if (!is(table, Table)) continue;
        const columns = Object.values(getTableColumns(table)).map(
          (column) => `"${column.name.replaceAll('"', '""')}"`,
        );
        await client.query(
          `select ${columns.join(", ")} from ${qualifiedTable(getTableName(table))} limit 0`,
        );
      }
      report.schema.columnsValid = true;
    } finally {
      client.release();
    }
  } catch {
    report.database.error = true;
  } finally {
    await pool.end().catch(() => undefined);
  }

  const releaseProtections = await checkReleaseProtections();
  const tablesOk = REQUIRED_TABLES.every(
    (table) => report.schema.requiredTables[table] === true,
  );
  const releaseProtectionsOk =
    releaseProtections.status === "healthy" ||
    releaseProtections.status === "not_applicable";
  if (
    report.database.connected &&
    tablesOk &&
    report.schema.columnsValid &&
    releaseProtectionsOk
  ) {
    report.status = "healthy";
  } else if (report.database.connected) {
    report.status = "degraded";
  }

  // Project only operator status and aggregate metrics. Raw schema/ledger
  // identifiers and arbitrary driver error strings must never leave this route.
  return NextResponse.json({
    status: report.status,
    service: report.service,
    environment: report.environment,
    releaseSha: report.releaseSha,
    database: report.database,
    schema: {
      columnsValid: report.schema.columnsValid,
      requiredTableCount: REQUIRED_TABLES.length,
      presentTableCount: REQUIRED_TABLES.filter(
        (table) => report.schema.requiredTables[table] === true,
      ).length,
      migrationCount: report.schema.migrationLedger.length,
    },
    releaseProtections: {
      status: releaseProtections.status,
      checkedAt: releaseProtections.checkedAt,
      missingCounts: {
        migrations: releaseProtections.missing.migrations.length,
        triggers: releaseProtections.missing.triggers.length,
        constraints: releaseProtections.missing.constraints.length,
        indexes: releaseProtections.missing.indexes.length,
      },
      apiLockdown: {
        anonSchemaUsage: releaseProtections.apiLockdown.anonSchemaUsage,
        authenticatedSchemaUsage: releaseProtections.apiLockdown.authenticatedSchemaUsage,
        tableGrantCount: releaseProtections.apiLockdown.tableGrantCount,
        routineGrantCount: releaseProtections.apiLockdown.routineGrantCount,
      },
    },
  }, {
    status: report.status === "unavailable" ? 503 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
