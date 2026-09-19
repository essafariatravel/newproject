/** Read-only live database verification; never prints credentials or user records. */
import "./lib/load-env";
import { Pool } from "pg";
import { getTableColumns, getTableName, is, Table } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { databasePoolConfig, databaseUrl, targetsSupabaseProject } from "../src/lib/database-config";
import { safeErrorCode, safeErrorText } from "../src/lib/safe-error";

const EXPECTED_PROJECT = "xgetzgixalrsmuvfthpf";
const quote = (identifier: string) => `"${identifier.replaceAll('"', '""')}"`;

async function main() {
  if (!process.env.DATABASE_URL || !targetsSupabaseProject(databaseUrl(), EXPECTED_PROJECT)) {
    throw new Error("Target not confirmed");
  }
  const pool = new Pool(databasePoolConfig());
  try {
    const client = await pool.connect();
    try {
      await client.query("begin read only");
      await client.query("set local statement_timeout = '15s'");
      await client.query("select 1");
      console.log(`Connected to configured Supabase project: ${EXPECTED_PROJECT}`);
      for (const table of Object.values(schema)) {
        if (!is(table, Table)) continue;
        const name = getTableName(table);
        const columns = Object.values(getTableColumns(table)).map((column) => quote(column.name));
        // Check every application column, not merely that a table exists.
        await client.query(`select ${columns.join(", ")} from public.${quote(name)} limit 0`);
        const result = await client.query(`select exists(select 1 from public.${quote(name)}) as populated`);
        console.log(`${name}: readable; ${result.rows[0].populated ? "contains data" : "empty"}`);
      }
      const ledger = await client.query("select name from public.schema_migrations order by name");
      const applied = new Set(ledger.rows.map((row) => row.name));
      if (!["0001_init.sql", "0002_branding.sql"].every((name) => applied.has(name))) {
        throw new Error("Migration ledger incomplete");
      }
      await client.query("commit");
      console.log("Schema and migration ledger verified. Login and browser tests are still required.");
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  // The real reason, safely redacted (PostgreSQL errors never contain the
  // password; anything resembling a connection URI is stripped).
  console.error(`Database verification FAILED${safeErrorCode(error) ? ` (code ${safeErrorCode(error)})` : ""}: ${safeErrorText(error)}`);
  console.error("No data was changed.");
  process.exitCode = 1;
});
