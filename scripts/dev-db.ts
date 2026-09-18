/**
 * Starts a local embedded PostgreSQL (real PostgreSQL binaries) for
 * development and tests. Usage: npm run db:up
 */
import EmbeddedPostgres from "embedded-postgres";
import path from "node:path";

const dataDir = path.join(process.cwd(), ".embedded-pg");

async function main() {
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: "postgres",
    password: "postgres",
    port: 5432,
    persistent: true,
  });
  try {
    await pg.initialise();
  } catch {
    // already initialised — fine
  }
  await pg.start();
  try {
    await pg.createDatabase("essafaria");
    console.log("Database essafaria created.");
  } catch {
    console.log("Database essafaria already exists.");
  }
  console.log("PostgreSQL ready on port 5432 (postgres/postgres).");
  // keep running
  process.on("SIGTERM", async () => {
    await pg.stop();
    process.exit(0);
  });
  setInterval(() => {}, 1 << 30);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
