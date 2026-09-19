import { readdir, readFile } from "node:fs/promises";
import type { Pool } from "pg";
import path from "node:path";

/** One transaction and one checked-out connection, also safe through a transaction pooler. */
export async function applyMigrations(pool: Pool, directory: string): Promise<string[]> {
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query("begin");
    await client.query("set local lock_timeout = '30s'");
    await client.query("set local statement_timeout = '5min'");
    await client.query("set local search_path to public");
    // Serialize concurrent deploys BEFORE reading/creating the migration ledger.
    await client.query("select pg_advisory_xact_lock(1936941426, 1)");
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
