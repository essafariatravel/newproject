/**
 * Read-only PREVIEW database observability snapshot for Performance Gate evidence.
 * Refuses any schema other than visa_os_preview.
 */
import "./lib/load-env";
import { databaseObservabilitySnapshot } from "../src/lib/database-observability";
import { pool } from "../src/lib/db";
import { assertPreviewObservabilityTarget } from "./lib/preview-observability-target";

async function main() {
  assertPreviewObservabilityTarget();

  const snapshot = await databaseObservabilitySnapshot();
  console.log(JSON.stringify(snapshot));

  if (snapshot.status === "unavailable") process.exitCode = 1;
}

main()
  .catch(() => {
    console.error("Database observability snapshot failed to execute.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => undefined);
  });
