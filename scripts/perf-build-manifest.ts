import "./lib/load-env";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Pool } from "pg";
import { databasePoolConfig } from "../src/lib/database-config";
import { assertSafePerfTarget, perfTable, safeTargetSummary } from "./perf-safety";

async function main() {
  const target = assertSafePerfTarget();

  const datasetId = String(process.env.PERF_DATASET_ID ?? "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{2,29}$/.test(datasetId)) {
    throw new Error("PERF_DATASET_ID is required.");
  }

  const marker = `PERF_DATASET:${datasetId}`;
  const output = resolve(
    process.env.PERF_APPLICATION_MANIFEST ??
    "perf/.runtime/application-manifest.json"
  );

  const pool = new Pool({
    ...databasePoolConfig(process.env),
    max: 1,
  });

  try {
    const agencyResult = await pool.query<{ id: string }>(
      `select id
         from ${perfTable("agencies")}
        where lower(email)=lower($1)
          and status='ACTIVE'
        limit 1`,
      ["perf.agency@load.example"],
    );

    const agencyId = agencyResult.rows[0]?.id;
    if (!agencyId) {
      throw new Error("PERF_LOAD_AGENCY is missing or inactive.");
    }

    const staffApps = await pool.query<{ id: string; agency_id: string }>(
      `select id, agency_id
         from ${perfTable("applications")}
        where agency_notes=$1
        order by reference
        limit 50`,
      [marker],
    );

    const agencyApplicationIds = staffApps.rows
      .filter((row) => row.agency_id === agencyId)
      .map((row) => row.id);

    const staffApplicationIds = staffApps.rows.map((row) => row.id);

    if (agencyApplicationIds.length === 0) {
      throw new Error("No PERF agency applications found for this dataset.");
    }

    if (staffApplicationIds.length === 0) {
      throw new Error("No PERF staff applications found for this dataset.");
    }

    const manifest = {
      datasetId,
      agencyApplicationIds,
      staffApplicationIds,
    };

    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, JSON.stringify(manifest, null, 2), {
      mode: 0o600,
    });

    console.log(JSON.stringify({
      ok: true,
      target: safeTargetSummary(target),
      datasetId,
      output,
      agencyApplicationCount: agencyApplicationIds.length,
      staffApplicationCount: staffApplicationIds.length,
      note: "Application IDs are stored only in the gitignored runtime manifest and are not printed.",
    }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Manifest generation failed.");
  process.exit(1);
});