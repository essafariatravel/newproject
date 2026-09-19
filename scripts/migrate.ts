/** Apply the repository SQL files once. No reset, seed, or destructive repair. */
import { loadEnvConfig } from "@next/env";
import path from "node:path";
import { Pool } from "pg";
import { databasePoolConfig } from "../src/lib/database-config";
import { applyMigrations } from "./lib/migrations";

loadEnvConfig(process.cwd());

async function main() {
  // Optional direct/session connection for DDL; DATABASE_URL remains canonical at runtime.
  const pool = new Pool(databasePoolConfig(process.env, true));
  try {
    const applied = await applyMigrations(pool, path.join(process.cwd(), "migrations"));
    for (const file of applied) console.log(`+ ${file} applied`);
    console.log(applied.length ? "Migrations complete." : "Migrations already up to date.");
  } finally {
    await pool.end();
  }
}

main().catch(() => {
  console.error("Migration failed; transaction rolled back. Check database access and migration history. No reset or seed was attempted.");
  process.exitCode = 1;
});
