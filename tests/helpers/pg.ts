/**
 * Test PostgreSQL lifecycle: a dedicated embedded PostgreSQL instance on port
 * 5434, fresh schema, migrations applied once per run.
 */
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Pool } from "pg";

import EmbeddedPostgres from "embedded-postgres";
import { applyMigrations } from "../../scripts/lib/migrations";

const PORT = 5434;
// Module resets must not create a second owner of the same running cluster.
type ClusterState = { pg: EmbeddedPostgres | null; ready: Promise<void> | null; directory: string | null };
const globalState = globalThis as typeof globalThis & { __essafariaTestCluster?: ClusterState };
const state = globalState.__essafariaTestCluster ??= { pg: null, ready: null, directory: null };

async function start(): Promise<void> {
  // Optional externally managed LOCAL test cluster, useful on Windows where
  // deeply nested package-manager paths exceed the native executable limit.
  // The connection is deliberately fixed; this flag cannot target a remote DB.
  if (process.env.ESSAFARIA_LOCAL_TEST_PG === "1") {
    const admin = new Pool({ connectionString: `postgresql://postgres:postgres@localhost:${PORT}/essafaria_test` });
    try { await applyMigrations(admin, path.join(process.cwd(), "migrations")); }
    finally { await admin.end(); }
    return;
  }
  state.directory = await mkdtemp(path.join(os.tmpdir(), "essafaria-test-pg-"));
  state.pg = new EmbeddedPostgres({
    databaseDir: state.directory,
    user: "postgres",
    password: "postgres",
    port: PORT,
    persistent: true,
  });
  await state.pg.initialise();
  await state.pg.start();
  await state.pg.createDatabase("essafaria_test");
  const admin = new Pool({ connectionString: `postgresql://postgres:postgres@localhost:${PORT}/essafaria_test` });
  try { await applyMigrations(admin, path.join(process.cwd(), "migrations")); }
  finally { await admin.end(); }
}

/** Idempotent: boots PG + migrations exactly once per test run. */
export function testDbReady(): Promise<void> {
  state.ready ??= start().catch(error => {
    throw new Error(`Disposable PostgreSQL startup failed (port ${PORT}, directory ${state.directory ?? "external local"}): ${error instanceof Error ? error.message : String(error ?? "embedded process exited before readiness")}`, { cause: error });
  });
  return state.ready;
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
      auth_rate_limits, legal_versions, sessions, users, agencies, site_settings
    restart identity cascade
  `);
  await pool.end();
}

export function testConnectionString(): string {
  return `postgresql://postgres:postgres@localhost:${PORT}/essafaria_test`;
}

export async function teardownTestDb(): Promise<void> {
  if (state.pg) {
    await state.pg.stop();
    state.pg = null;
    if (state.directory) await rm(state.directory, { recursive: true, force: true });
    state.directory = null;
    state.ready = null;
  }
}
