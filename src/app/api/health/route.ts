/**
 * GET /api/health — safe runtime diagnostics for deployment verification.
 *
 * Answers, WITHOUT ever exposing credentials:
 *  - whether THIS deployment actually received DATABASE_URL,
 *  - which host/port/database/TLS mode it targets (hostname only, never the
 *    username or password),
 *  - whether a real PostgreSQL connection succeeds and how long it takes,
 *  - the exact PostgreSQL error code/message when it does not (defensively
 *    redacted of anything resembling a connection URI),
 *  - whether the application's required tables exist, whether the migration
 *    ledger is complete, and whether accounts/catalogue data are present.
 *
 * The handler is fully self-contained (its own one-connection pool) and must
 * never throw: a failing database produces a report, not a 500.
 */
import { NextResponse } from "next/server";
import { Pool } from "pg";
import { databasePoolConfig, databaseUrl, targetsSupabaseProject } from "@/lib/database-config";
import { safeErrorCode, safeErrorText } from "@/lib/safe-error";
import { databaseSchema, qualifiedTable } from "@/lib/database-schema";
import { getTableColumns, getTableName, is, Table } from "drizzle-orm";
import * as applicationSchema from "@/db/schema";

export const dynamic = "force-dynamic";

const EXPECTED_SUPABASE_PROJECT = "xgetzgixalrsmuvfthpf";
const REQUIRED_TABLES = ["users", "site_settings", "visa_types", "countries", "schema_migrations"] as const;

export async function GET() {
  const report = {
    ok: false,
    service: "essafaria-visa-os",
    deployment: {
      environment: process.env.VERCEL_ENV ?? null,
      region: process.env.VERCEL_REGION ?? null,
    },
    database: {
      configured: Boolean(process.env.DATABASE_URL),
      host: null as string | null,
      port: null as string | null,
      name: null as string | null,
      ssl: null as string | null,
      mode: null as string | null,
      intendedSupabaseProject: null as boolean | null,
      connected: false,
      latencyMs: null as number | null,
      error: null as { code: string | null; message: string } | null,
    },
    schema: {
      name: databaseSchema(),
      columnsValid: false,
      requiredTables: {} as Record<string, boolean>,
      migrationLedger: [] as string[],
      hasUserAccounts: null as boolean | null,
      visaProgrammes: null as number | null,
      countries: null as number | null,
    },
    notes: [] as string[],
  };

  if (!report.database.configured) {
    report.notes.push(
      "DATABASE_URL is NOT set for this deployment. Vercel → Settings → Environment Variables → DATABASE_URL → " +
        "Preview environment (no branch filter) → Save, then create a new deployment (Redeploy).",
    );
  } else {
    // Parse the target from the canonical configuration (never credentials).
    try {
      const url = new URL(databaseUrl());
      report.database.host = url.hostname;
      report.database.port = url.port || "5432";
      report.database.name = url.pathname.slice(1);
      const sslmode = url.searchParams.get("sslmode");
      report.database.ssl = sslmode ?? (databasePoolConfig().ssl ? "verify-full" : null);
      const isPooler = url.hostname.includes(".pooler.");
      report.database.mode = isPooler
        ? url.port === "6543"
          ? "supabase transaction pooler"
          : "supabase session pooler"
        : url.hostname === `db.${EXPECTED_SUPABASE_PROJECT}.supabase.co`
          ? "supabase direct connection"
          : "other";
      report.database.intendedSupabaseProject = targetsSupabaseProject(databaseUrl(), EXPECTED_SUPABASE_PROJECT);
      if (!report.database.intendedSupabaseProject) {
        report.notes.push(
          `DATABASE_URL does not target the intended Supabase project ${EXPECTED_SUPABASE_PROJECT}.`,
        );
      }
      if (report.database.mode === "supabase direct connection") {
        report.notes.push(
          "Direct connections (db.<ref>.supabase.co) require IPv6, which Vercel functions may not have. " +
            "Prefer the transaction pooler URI (port 6543) from the Supabase Connect dialog.",
        );
      }
      if (isPooler && !report.database.ssl) {
        report.notes.push("No sslmode in the URI — Supabase poolers expect sslmode=require.");
      }
    } catch (err) {
      report.database.error = { code: safeErrorCode(err), message: safeErrorText(err) };
    }
  }

  // Live connection + read-only schema inspection (self-contained pool).
  if (report.database.configured && !report.database.error) {
    const pool = new Pool({ ...databasePoolConfig(), max: 1 });
    const startedAt = Date.now();
    try {
      const client = await pool.connect();
      report.database.connected = true;
      report.database.latencyMs = Date.now() - startedAt;
      try {
        for (const table of REQUIRED_TABLES) {
          const res = await client.query("select to_regclass($1) is not null as present", [qualifiedTable(table)]);
          report.schema.requiredTables[table] = Boolean(res.rows[0]?.present);
        }
        if (report.schema.requiredTables.schema_migrations) {
          const ledger = await client.query(`select name from ${qualifiedTable("schema_migrations")} order by name`);
          report.schema.migrationLedger = ledger.rows.map((row) => String(row.name));
        }
        if (report.schema.requiredTables.users) {
          const users = await client.query(`select exists(select 1 from ${qualifiedTable("users")}) as any`);
          report.schema.hasUserAccounts = Boolean(users.rows[0]?.any);
        }
        if (report.schema.requiredTables.visa_types) {
          const visas = await client.query(`select count(*)::int as n from ${qualifiedTable("visa_types")} where active`);
          report.schema.visaProgrammes = Number(visas.rows[0]?.n ?? 0);
        }
        if (report.schema.requiredTables.countries) {
          const countries = await client.query(`select count(*)::int as n from ${qualifiedTable("countries")} where active`);
          report.schema.countries = Number(countries.rows[0]?.n ?? 0);
        }
        for (const table of Object.values(applicationSchema)) {
          if (!is(table, Table)) continue;
          const columns = Object.values(getTableColumns(table)).map((column) => `"${column.name.replaceAll('"', '""')}"`);
          await client.query(`select ${columns.join(", ")} from ${qualifiedTable(getTableName(table))} limit 0`);
        }
        report.schema.columnsValid = true;
      } finally {
        client.release();
      }
    } catch (err) {
      report.database.error = { code: safeErrorCode(err), message: safeErrorText(err) };
    } finally {
      await pool.end().catch(() => undefined);
    }
  }

  const tablesOk = REQUIRED_TABLES.every((table) => report.schema.requiredTables[table] === true);
  report.ok = report.database.connected && !report.database.error && tablesOk && report.schema.columnsValid &&
    ["0001_init.sql", "0002_branding.sql"].every((name) => report.schema.migrationLedger.includes(name));

  if (report.database.configured && !report.database.connected) {
    report.notes.push("DATABASE_URL is set but the connection failed — see database.error for the PostgreSQL error code.");
  }
  if (report.database.connected && !tablesOk) {
    report.notes.push(
      "Connected, but some required tables are missing — the Preview build migration step did not complete; check the deployment build logs.",
    );
  }
  if (report.ok && report.schema.hasUserAccounts === false) {
    report.notes.push(
      "No user accounts exist yet. For Preview only: set ALLOW_DEMO_SEED=true, SEED_ADMIN_PASSWORD and " +
        "SEED_AGENCY_PASSWORD (Preview scope) in Vercel, then redeploy to create the guarded demo accounts.",
    );
  }

  return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
}
