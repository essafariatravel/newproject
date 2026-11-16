#!/usr/bin/env tsx
/**
 * Local development helper — clears the registration rate-limit fingerprint.
 *
 * The public /agency/register endpoint rate-limits by client IP (5/hour,
 * 20/day) so repeated local harness runs against the same address would be
 * blocked after the first run. This script nulls `agency_registrations.
 * ip_address` so the next local run starts from zero.
 *
 * SAFETY: refuses to run against anything that is not a local database. This
 * must never be used against the hosted Preview or Production schemas.
 */
import { Pool } from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

let host = "";
try {
  host = new URL(url).hostname;
} catch {
  console.error("DATABASE_URL is not a valid connection string");
  process.exit(1);
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", "host.docker.internal"]);
if (!LOCAL_HOSTS.has(host)) {
  console.error(`refusing: ${host} is not a local database (dev helper only)`);
  process.exit(1);
}

const pool = new Pool({ connectionString: url });
(async () => {
  const res = await pool.query(
    "update agency_registrations set ip_address = null where ip_address is not null returning id",
  );
  console.log(`cleared registration rate-limit fingerprints: ${res.rowCount ?? 0} row(s)`);
  await pool.end();
})().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
