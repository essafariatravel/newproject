import { afterAll, beforeAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { applyMigrations } from "../../scripts/lib/migrations";
import { suiteSetup } from "./global-state";

/** Candidate DDL is explicitly rehearsed only for its own disposable suite.
 * Historical 0033 recovery/release qualifications must remain genuinely 0033. */
export function candidateSuiteSetup() {
  suiteSetup();
  let applied = false;
  async function requireFixture() {
    const row = (await pool.query("select current_database() name,host(inet_server_addr()) address,inet_server_port() port")).rows[0];
    if (row.name !== "essafaria_test" || row.port !== 5434 || !["127.0.0.1", "::1"].includes(row.address)) throw new Error("CANDIDATE_REHEARSAL_LOOPBACK_FIXTURE_REQUIRED");
  }
  beforeAll(async () => {
    await requireFixture();
    await applyMigrations(pool, path.join(process.cwd(), "migrations/candidates"), "public");
    applied = true;
  });
  afterAll(async () => {
    if (!applied) return;
    await requireFixture();
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("drop table public.document_retention_receipts, public.document_retention_case_events, public.document_retention_policy, public.legal_acceptances");
      await client.query("drop function public.reject_document_retention_evidence_mutation(), public.reject_legal_acceptance_mutation()");
      await client.query("truncate public.legal_versions");
      await client.query("alter table public.legal_versions drop constraint legal_versions_kind_check");
      await client.query("alter table public.legal_versions add constraint legal_versions_kind_check check(kind in ('terms','privacy'))");
      await client.query("delete from public.schema_migrations where name=any($1::text[])", [["0034_document_retention.sql", "0035_legal_document_kinds.sql"]]);
      await client.query("commit");
    } catch (error) { await client.query("rollback"); throw error; }
    finally { client.release(); }
  });
}
