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
  const output = resolve(process.env.PERF_APPLICATION_MANIFEST ?? "perf/.runtime/application-manifest.json");
  const pool = new Pool({ ...databasePoolConfig(process.env), max: 1 });

  try {
    const client = await pool.connect();
    try {
      const agency = await client.query<{ id: string }>(
        `select id from ${perfTable("agencies")} where lower(email)=lower($1) and status='ACTIVE' limit 1`,
        ["perf.agency@load.example"],
      );
      const agencyId = agency.rows[0]?.id;
      if (!agencyId) throw new Error("Synthetic PERF agency is missing or inactive.");

      const agencyApps = await client.query<{ id: string }>(
        `select id from ${perfTable("applications")}
          where agency_id=$1 and agency_notes=$2
          order by reference, id
          limit 50`,
        [agencyId, marker],
      );
      const staffApps = await client.query<{ id: string }>(
        `select id from ${perfTable("applications")}
          where agency_notes=$1
          order by reference, id
          limit 50`,
        [marker],
      );

      if (agencyApps.rows.length === 0 || staffApps.rows.length === 0) {
        throw new Error(`Dataset ${datasetId} has no usable synthetic application rows.`);
      }

      const manifest = {
        generatedAt: new Date().toISOString(),
        datasetId,
        target: safeTargetSummary(target),
        agencyApplicationIds: agencyApps.rows.map((row) => row.id),
        staffApplicationIds: staffApps.rows.map((row) => row.id),
      };

      await mkdir(dirname(output), { recursive: true });
      await writeFile(output, JSON.stringify(manifest, null, 2), { mode: 0o600 });
      console.log(JSON.stringify({
        ok: true,
        datasetId,
        target: safeTargetSummary(target),
        output,
        agencyApplicationCount: manifest.agencyApplicationIds.length,
        staffApplicationCount: manifest.staffApplicationIds.length,
      }, null, 2));
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Application manifest generation failed.");
  process.exit(1);
});
