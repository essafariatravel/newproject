/**
 * Test PostgreSQL lifecycle: a dedicated embedded PostgreSQL instance on port
 * 5434, fresh schema, migrations applied once per run.
 */
import { rm } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";

import EmbeddedPostgres from "embedded-postgres";
import { applyMigrations } from "../../scripts/lib/migrations";

const PORT = 5434;
const DATA_DIR = path.join(process.cwd(), "tests", ".pgdata-test");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pg: any = null;
let ready: Promise<void> | null = null;

async function start(): Promise<void> {
  await rm(DATA_DIR, { recursive: true, force: true });
  pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: "postgres",
    password: "postgres",
    port: PORT,
    persistent: false,
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("essafaria_test");
  const admin = new Pool({ connectionString: `postgresql://postgres:postgres@localhost:${PORT}/essafaria_test` });
  await applyMigrations(admin, path.join(process.cwd(), "migrations"));
  await admin.end();
}

/** Idempotent: boots PG + migrations exactly once per test run. */
export function testDbReady(): Promise<void> {
  ready ??= start();
  return ready;
}

/** Truncate all business tables between tests (fast, deterministic). */
export async function resetData(): Promise<void> {
  const pool = new Pool({ connectionString: `postgresql://postgres:postgres@localhost:${PORT}/essafaria_test` });
  await pool.query(`
    truncate table
      audit_logs, notifications, communications, wallet_transactions,
      documents, document_blobs, checklist_items, applicants,
      application_status_history, applications,
      visa_requirements, visa_types, document_types, visa_categories, countries,
      status_transitions, statuses, priorities, currencies,
      account_activation_tokens, agency_registration_history,
      agency_registration_documents, agency_registrations,
      sessions, users, agencies, site_settings
    restart identity cascade
  `);
  await pool.end();
}

export function testConnectionString(): string {
  return `postgresql://postgres:postgres@localhost:${PORT}/essafaria_test`;
}

export async function teardownTestDb(): Promise<void> {
  if (pg) {
    await pg.stop();
    pg = null;
    ready = null;
  }
}
