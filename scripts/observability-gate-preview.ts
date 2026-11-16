/**
 * Single read-only Preview observability gate report.
 * Refuses any schema other than visa_os_preview and performs no mutation.
 */
import "./lib/load-env";
import { runIntegrityChecks } from "../src/lib/integrity";
import { databaseObservabilitySnapshot } from "../src/lib/database-observability";
import { checkReleaseProtections } from "../src/lib/release-protections";
import { pool } from "../src/lib/db";
import { assertPreviewObservabilityTarget } from "./lib/preview-observability-target";

async function main() {
  assertPreviewObservabilityTarget();
  process.env.OBSERVABILITY_CUTOVER_AT ??= "2026-10-03T00:00:00.000Z";

  const [integrity, database, releaseProtections] = await Promise.all([
    runIntegrityChecks(),
    databaseObservabilitySnapshot(),
    checkReleaseProtections(),
  ]);

  const fail =
    integrity.status === "violation" ||
    integrity.status === "unavailable" ||
    database.status === "unavailable" ||
    releaseProtections.status !== "healthy";

  const status = fail
    ? "fail"
    : integrity.status === "degraded" || database.status === "degraded"
      ? "pass_with_legacy_baseline"
      : "pass";

  const report = {
    gate: "observability",
    environment: "preview",
    status,
    releaseSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    generatedAt: new Date().toISOString(),
    integrity,
    database,
    releaseProtections,
  };

  process.stdout.write(`${JSON.stringify(report)}\n`);
  if (fail) process.exitCode = 2;
}

main()
  .catch(() => {
    process.stderr.write("Preview observability gate failed to execute.\n");
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => undefined);
  });
