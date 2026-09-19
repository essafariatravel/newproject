import { readdir, readFile } from "node:fs/promises";
import type { Pool } from "pg";
import path from "node:path";
import { databaseSchema } from "../../src/lib/database-schema";

/** One transaction and one checked-out connection, also safe through a transaction pooler. */
export async function applyMigrations(pool: Pool, directory: string, schema = databaseSchema()): Promise<string[]> {
  databaseSchema({ DATABASE_SCHEMA: schema });
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query("begin");
    await client.query("set local lock_timeout = '30s'");
    await client.query("set local statement_timeout = '5min'");
    // Serialize concurrent deploys BEFORE reading/creating the migration ledger.
    await client.query("select pg_advisory_xact_lock(1936941426, 1)");
    await client.query(`create schema if not exists "${schema}"`);
    await client.query(`set local search_path to "${schema}"`);
    // Refuse to treat an unrelated existing schema as a fresh installation.
    const collision = await client.query(
      "select to_regclass($1) as users, to_regclass($2) as ledger",
      [`${schema}.users`, `${schema}.schema_migrations`],
    );
    if (collision.rows[0].users && !collision.rows[0].ledger) {
      throw new Error("Existing users table has no application migration ledger. Set DATABASE_SCHEMA to a new isolated schema; existing data was not changed.");
    }
    await client.query(`create table if not exists schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )`);
    const files = (await readdir(directory)).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
      const existing = await client.query("select 1 from schema_migrations where name = $1", [file]);
      if (existing.rowCount) continue;
      await client.query(await readFile(path.join(directory, file), "utf8"));
      await client.query("insert into schema_migrations (name) values ($1)", [file]);
      applied.push(file);
    }
    await client.query("commit");
    return applied;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
