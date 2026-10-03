/**
 * Read-only PREVIEW integrity reconciliation.
 * Refuses any schema other than visa_os_preview.
 */
import "./lib/load-env";
import { runIntegrityChecks } from "../src/lib/integrity";
import { pool } from "../src/lib/db";

async function main() {
  if (process.env.DATABASE_SCHEMA !== "visa_os_preview") {
    throw new Error("Refusing: integrity script only targets visa_os_preview.");
  }

  const report = await runIntegrityChecks();
  console.log(JSON.stringify(report));

  if (report.status === "violation") process.exitCode = 2;
  if (report.status === "unavailable") process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error("Integrity reconciliation failed to execute.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => undefined);
  });
