/** Apply the repository SQL files once. No reset, seed, or destructive repair. */
import "./lib/load-env";
import path from "node:path";
import { Pool } from "pg";
import { databasePoolConfig } from "../src/lib/database-config";
import { safeErrorCode, safeErrorText } from "../src/lib/safe-error";
import { applyMigrations } from "./lib/migrations";


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

main().catch((error) => {
  // The real reason, safely redacted (PostgreSQL errors never contain the
  // password; anything resembling a connection URI is stripped).
  console.error(`Migration failed; transaction rolled back${safeErrorCode(error) ? ` (code ${safeErrorCode(error)})` : ""}: ${safeErrorText(error)}`);
  console.error("No reset or seed was attempted. Check database access and migration history.");
  process.exitCode = 1;
});
