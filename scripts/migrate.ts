/**
 * Migration runner — applies SQL migrations in order, exactly once.
 * Usage: npm run db:migrate
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";

async function main() {
  const connectionString =
    process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/essafaria";
  const pool = new Pool({ connectionString });
  try {
    await pool.query(
      `create table if not exists schema_migrations (
         name text primary key,
         applied_at timestamptz not null default now()
       )`,
    );
    const dir = path.join(process.cwd(), "migrations");
    const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
      const applied = await pool.query("select 1 from schema_migrations where name = $1", [file]);
      if (applied.rowCount && applied.rowCount > 0) {
        console.log(`= ${file} (already applied)`);
        continue;
      }
      const sqlText = await readFile(path.join(dir, file), "utf8");
      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query(sqlText);
        await client.query("insert into schema_migrations (name) values ($1)", [file]);
        await client.query("commit");
        console.log(`+ ${file} applied`);
      } catch (err) {
        await client.query("rollback");
        throw err;
      } finally {
        client.release();
      }
    }
    console.log("Migrations complete.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
