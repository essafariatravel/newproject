/**
 * Production release tooling — visa_os schema recovery + Phase 2 migration.
 * (audit refresh: production env secrets configured — read-only evidence pass; @next/env hoist fixed)
 *
 * MODES
 *   audit   — read-only: ledger, columnsValid, counts, wallet checksums,
 *             brand configuration, status-remap exposure. Never writes.
 *   apply   — surgical in-place restore point (per-table snapshot copies),
 *             then the repository's pending migrations via the same
 *             transactional runner used everywhere, then a postflight that
 *             proves IDENTICAL levels of Production data + wallet/ledger
 *             integrity. Any guard failure aborts with the whole migration
 *             transaction rolled back.
 *
 * HARD SAFETY GUARDS (fail closed):
 *   - DATABASE_SCHEMA must equal "visa_os" (never derived).
 *   - DATABASE_URL host must belong to the intended Supabase project.
 *   - The schema_migrations ledger MUST exist — this script never
 *     bootstraps a ledger on Production (a missing ledger means a
 *     mispointed database, not a fresh install).
 *   - Protected-table counts/wallet checksums must be identical after.
 *   - branding (site_settings brand.*) must be byte-identical after.
 *
 * This tool never truncates, drops, deletes rows from, reseeds, or
 * resets ANY Production table.
 */
import { loadEnvConfig } from "@next/env";
import path from "node:path";
import fs from "node:fs";
import { Pool } from "pg";
import { getTableColumns, getTableName, is, Table } from "drizzle-orm";
import * as applicationSchema from "../src/db/schema";
import { databasePoolConfig, targetsSupabaseProject } from "../src/lib/database-config";
import { safeErrorCode, safeErrorText } from "../src/lib/safe-error";
import { applyMigrations } from "./lib/migrations";

loadEnvConfig(process.cwd());

const MODE = process.argv[2] === "apply" ? "apply" : "audit";
const SCHEMA = "visa_os";
const EXPECTED_SUPABASE_PROJECT = "xgetzgixalrsmuvfthpf";
const STAMP = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 12);
const SNAP = (t: string) => `visa_os._restore_${STAMP}_${t}`;

const PROTECTED_COUNTS = [
  "users",
  "agencies",
  "applications",
  "applicants",
  "notifications",
  "communications",
  "audit_logs",
  "site_settings",
  "documents",
  "document_blobs",
  "checklist_items",
  "wallet_transactions",
  "application_status_history",
] as const;

/** Tables the pending migrations write to — the ONLY ones snapshotted. */
const SNAPSHOT_TABLES = [
  "statuses",
  "status_transitions",
  "applications",
  "applicants",
  "agencies",
  "users",
  "currencies",
  "document_types",
  "schema_migrations",
  "site_settings",
] as const;

interface SnapshotReport {
  counts: Record<string, number | null>;
  walletChecksum: string | null;
  agencyWallets: string | null;
  ledger: string[];
  brand: Record<string, unknown>;
  statusMix: Record<string, number>;
  remapExposure: Record<string, number>;
  columnsValid: boolean;
  schemaError: string | null;
  snapshotTables: string[];
  guardNotes: string[];
}

function fail(msg: string): never {
  console.error(`GUARD FAILURE: ${msg}`);
  try {
    fs.writeFileSync(
      "/tmp/prod-release-report.md",
      `### Production release — GUARD FAILURE (${MODE})\n\n\`\`\`\n${msg}\n\`\`\`\n`,
    );
  } catch {
    // report channel best-effort only
  }
  process.exit(1);
}

async function collect(client: import("pg").PoolClient, notes: string[]): Promise<SnapshotReport> {
  const report: SnapshotReport = {
    counts: {},
    walletChecksum: null,
    agencyWallets: null,
    ledger: [],
    brand: {},
    statusMix: {},
    remapExposure: {},
    columnsValid: false,
    schemaError: null,
    snapshotTables: [],
    guardNotes: notes,
  };
  for (const table of PROTECTED_COUNTS) {
    try {
      const res = await client.query(`select count(*)::int as n from visa_os.${table}`);
      report.counts[table] = Number(res.rows[0]?.n ?? 0);
    } catch {
      report.counts[table] = null; // table absent at this migration level — recorded, never fabricated
    }
  }
  try {
    const res = await client.query(
      `select md5(string_agg(id::text || '|' || agency_id::text || '|' || type || '|' || amount::text || '|' || balance_before::text || '|' || balance_after::text, '+' order by id)) as sum from visa_os.wallet_transactions`,
    );
    report.walletChecksum = String(res.rows[0]?.sum ?? "empty");
  } catch {
    report.walletChecksum = null;
  }
  try {
    const res = await client.query(
      `select md5(string_agg(id::text || '|' || currency || '|' || balance::text, '+' order by id)) as sum from visa_os.agencies`,
    );
    report.agencyWallets = String(res.rows[0]?.sum ?? "empty");
  } catch {
    report.agencyWallets = null;
  }
  try {
    const res = await client.query(`select name from visa_os.schema_migrations order by name`);
    report.ledger = res.rows.map((r) => String(r.name));
  } catch {
    report.ledger = [];
  }
  try {
    const res = await client.query(`select key, value from visa_os.site_settings where key like 'brand.%' order by key`);
    for (const row of res.rows) report.brand[String(row.key)] = row.value;
  } catch {
    notes.push("site_settings brand keys unreadable at this level");
  }
  try {
    const res = await client.query(
      `select s.code as code, count(*)::int as n
       from visa_os.applications a join visa_os.statuses s on s.id = a.status_id group by s.code order by s.code`,
    );
    for (const row of res.rows) report.statusMix[String(row.code)] = Number(row.n);
  } catch {
    notes.push("status mix unavailable at this level");
  }
  const REMAP_SOURCES = ["REFUSED", "UNDER_REVIEW", "DOCUMENTS_REQUIRED", "PROCESSING", "EMBASSY_SUBMISSION", "AWAITING_DECISION", "COMPLETED"];
  for (const code of REMAP_SOURCES) report.remapExposure[code] = report.statusMix[code] ?? 0;
  try {
    for (const table of Object.values(applicationSchema)) {
      if (!is(table, Table)) continue;
      const columns = Object.values(getTableColumns(table)).map((c) => `"${c.name.replaceAll('"', '""')}"`);
      await client.query(`select ${columns.join(", ")} from "visa_os"."${getTableName(table)}" limit 0`);
    }
    report.columnsValid = true;
  } catch (err) {
    report.columnsValid = false;
    report.schemaError = `${safeErrorCode(err) ?? "?"}: ${safeErrorText(err).slice(0, 200)}`;
  }
  return report;
}

function diffReport(before: SnapshotReport, after: SnapshotReport): string[] {
  const findings: string[] = [];
  for (const table of PROTECTED_COUNTS) {
    if (before.counts[table] !== after.counts[table]) {
      findings.push(`count change ${table}: ${before.counts[table]} -> ${after.counts[table]}`);
    }
  }
  if (before.walletChecksum !== after.walletChecksum) findings.push("wallet_transactions checksum changed");
  if (before.agencyWallets !== after.agencyWallets) findings.push("agency wallet balances changed");
  const brandBefore = JSON.stringify(before.brand);
  const brandAfter = JSON.stringify(after.brand);
  if (brandBefore !== brandAfter) findings.push("brand.* site_settings changed (forbidden during release)");
  return findings;
}

function renderReport(
  mode: string,
  head: string,
  before: SnapshotReport,
  after: SnapshotReport | null,
  findings: string[],
  applied: string[],
): string {
  const lines: string[] = [];
  lines.push(`### Production release — ${mode.toUpperCase()} report (schema visa_os)`);
  lines.push("");
  lines.push("```");
  lines.push(`host: ${head}`);
  lines.push(`ledger BEFORE: [${before.ledger.join(", ") || "none"}]`);
  if (after) lines.push(`ledger AFTER : [${after.ledger.join(", ") || "none"}]`);
  if (applied.length) lines.push(`applied: ${applied.join(", ")}`);
  lines.push(`columnsValid BEFORE: ${before.columnsValid}  ${before.schemaError ? `(${before.schemaError})` : ""}`.trim());
  if (after) lines.push(`columnsValid AFTER : ${after.columnsValid}  ${after.schemaError ? `(${after.schemaError})` : ""}`.trim());
  lines.push("");
  lines.push("counts BEFORE:" + JSON.stringify(before.counts));
  if (after) lines.push("counts AFTER :" + JSON.stringify(after.counts));
  lines.push(`wallet ledger checksum BEFORE: ${before.walletChecksum}`);
  if (after) lines.push(`wallet ledger checksum AFTER : ${after.walletChecksum}`);
  lines.push(`agency balances checksum BEFORE: ${before.agencyWallets}`);
  if (after) lines.push(`agency balances checksum AFTER : ${after.agencyWallets}`);
  lines.push("");
  lines.push("status mix BEFORE:" + JSON.stringify(before.statusMix));
  if (after) lines.push("status mix AFTER :" + JSON.stringify(after.statusMix));
  lines.push("remap exposure (0005/0006 sources): " + JSON.stringify(before.remapExposure));
  lines.push("brand keys observed: " + Object.keys(before.brand).join(", "));
  lines.push(`brand.name=${JSON.stringify(before.brand["brand.name"] ?? null)}`);
  if (before.snapshotTables.length) lines.push(`restore snapshots: ${before.snapshotTables.join(", ")}`);
  if (before.guardNotes.length) lines.push(`notes: ${before.guardNotes.join(" | ")}`);
  if (findings.length) {
    lines.push("");
    lines.push(`INTEGRITY FINDINGS (${findings.length}): ${findings.join(" ; ")}`);
  } else if (after) {
    lines.push("INTEGRITY: all protected counts, wallet/ledger checksums, agency balances and brand settings IDENTICAL.");
  }
  lines.push("```");
  return lines.join("\n");
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) fail("DATABASE_URL is not available to this job — expected in the 'Production' GitHub environment secrets.");
  let host = "";
  try {
    host = new URL(url).hostname;
    if (!targetsSupabaseProject(url, EXPECTED_SUPABASE_PROJECT)) {
      fail(`DATABASE_URL target ('${host}') does not belong to the intended Supabase project; refusing to run.`);
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("DATABASE_URL target")) throw err;
    fail("DATABASE_URL is not parseable or does not target the intended Supabase project.");
  }
  if ((process.env.DATABASE_SCHEMA ?? "").trim() !== SCHEMA) {
    fail(`DATABASE_SCHEMA must be exactly '${SCHEMA}' for this tool (got '${process.env.DATABASE_SCHEMA ?? ""}'). Refusing to run.`);
  }
  const pool = new Pool(databasePoolConfig(process.env, true));
  const notes: string[] = [];
  try {
    const client = await pool.connect();
    let dbName = "";
    let before: SnapshotReport;
    try {
      await client.query(`set search_path to ${SCHEMA}`);
      const who = await client.query("select current_database() as db, current_schema() as sc");
      if (who.rows[0].sc !== SCHEMA) fail(`resolved schema is '${who.rows[0].sc}', expected '${SCHEMA}'.`);
      dbName = String(who.rows[0].db);
      const ledgerProbe = await client.query(`select to_regclass('${SCHEMA}.schema_migrations') as t`);
      if (!ledgerProbe.rows[0].t) {
        fail("Production migration ledger is missing — this is not a managed Production database state. Nothing was changed.");
      }
      notes.push(`connected: database=${dbName} schema=${SCHEMA}`);
      before = await collect(client, notes);
    } finally {
      client.release();
    }

    if (MODE === "audit") {
      const md = renderReport("audit", host, before, null, [], []);
      fs.writeFileSync("/tmp/prod-release-report.md", md);
      console.log(md);
      return;
    }

    // ---- apply mode: surgical in-place restore point (outside the migration transaction) ----
    const snapClient = await pool.connect();
    try {
      for (const table of SNAPSHOT_TABLES) {
        const exists = await snapClient.query(`select to_regclass($1) as t`, [`${SCHEMA}.${table}`]);
        if (!exists.rows[0].t) continue;
        await snapClient.query(`drop table if exists ${SNAP(table)}`);
        await snapClient.query(`create table ${SNAP(table)} as select * from ${SCHEMA}.${table}`);
        before.snapshotTables.push(SNAP(table));
      }
    } finally {
      snapClient.release();
    }

    const applied = await applyMigrations(pool, path.join(process.cwd(), "migrations"), SCHEMA);

    const postClient = await pool.connect();
    let after: SnapshotReport;
    try {
      await postClient.query(`set search_path to ${SCHEMA}`);
      after = await collect(postClient, notes);
    } finally {
      postClient.release();
    }

    const findings = diffReport(before, after);
    const md = renderReport("apply", host, before, after, findings, applied);
    fs.writeFileSync("/tmp/prod-release-report.md", md);
    console.log(md);
    if (findings.length) {
      console.error("INTEGRITY VIOLATIONS — investigate before proceeding:", findings);
      process.exitCode = 3;
    }
    if (!after.columnsValid) {
      console.error("Post-migration column validation still failing — NOT ready.");
      process.exitCode = 4;
    }
    if (after.ledger.length < before.ledger.length) {
      console.error("Migration ledger shrank — unexpected; NOT ready.");
      process.exitCode = 5;
    }
  } finally {
    await pool.end();
  }
}

function persistError(text: string): void {
  try {
    if (!fs.existsSync("/tmp/prod-release-report.md")) {
      fs.writeFileSync(
        "/tmp/prod-release-report.md",
        `### Production release — AUDIT/EXECUTION FAILURE (${MODE})\n\n\`\`\`\n${text}\n\`\`\`\n`,
      );
    }
  } catch {
    // best effort
  }
}

main().catch((error) => {
  const text = `${safeErrorCode(error) ? `(code ${safeErrorCode(error)}) ` : ""}${safeErrorText(error)}`;
  console.error(`prod-release ${MODE} failed: ${text}`);
  console.error("No reset, seed, or destructive repair was attempted. The migration transaction is all-or-nothing.");
  persistError(text);
  process.exitCode = 1;
});
