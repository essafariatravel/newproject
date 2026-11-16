/**
 * Scheduled read-only Preview watchdog.
 *
 * This is intentionally Preview-only. It performs no mutation and emits only
 * aggregate, privacy-safe evidence. SEV1/SEV2 exit non-zero; SEV3/legacy
 * baseline remain successful to avoid alert fatigue.
 */
import "./lib/load-env";
import { pool } from "../src/lib/db";
import { databaseObservabilitySnapshot } from "../src/lib/database-observability";
import { runIntegrityChecks } from "../src/lib/integrity";
import { checkReleaseProtections } from "../src/lib/release-protections";
import { classifyPreviewWatchdog } from "../src/lib/observability-watchdog";
import { assertPreviewObservabilityTarget } from "./lib/preview-observability-target";

async function main() {
  assertPreviewObservabilityTarget();
  process.env.OBSERVABILITY_CUTOVER_AT ??= "2026-10-03T00:00:00.000Z";

  const [integrity, database, releaseProtections] = await Promise.all([
    runIntegrityChecks(),
    databaseObservabilitySnapshot(),
    checkReleaseProtections(),
  ]);

  const classification = classifyPreviewWatchdog({
    integrity,
    database,
    releaseProtections,
  });

  const report = {
    watchdog: "essafaria-preview",
    environment: "preview",
    generatedAt: new Date().toISOString(),
    releaseSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    ...classification,
    integrity,
    database,
    releaseProtections,
  };

  const json = JSON.stringify(report);
  process.stdout.write(`${json}\n`);

  const outputPath = process.env.WATCHDOG_OUTPUT_PATH?.trim();
  if (outputPath) {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(outputPath, `${json}\n`, { encoding: "utf8", mode: 0o600 });
  }

  if (classification.severity === "SEV1" || classification.severity === "SEV2") {
    process.exitCode = 2;
  }
}

main()
  .catch(() => {
    process.stderr.write("Observability watchdog failed to execute.\n");
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => undefined);
  });
