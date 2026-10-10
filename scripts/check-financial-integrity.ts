/**
 * Read-only PREVIEW integrity reconciliation.
 * Refuses any schema other than visa_os_preview.
 */
import "./lib/load-env";
import { runIntegrityChecks } from "../src/lib/integrity";
import { pool } from "../src/lib/db";
import { assertPreviewObservabilityTarget } from "./lib/preview-observability-target";

async function main() {
  assertPreviewObservabilityTarget();

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
