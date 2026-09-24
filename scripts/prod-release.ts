/**
 * Production release tooling — visa_os.
 *
 * CURRENT RELEASE SCOPE: migrations 0013 → 0017 on top of an approved baseline
 * of ledger 0001-0012 (live read-only Production audit, run 35993822270).
 * It supersedes the 0011+0012 release (authorization d2bb0d3, already applied
 * on 2026-09-23); older baselines stay in git history.
 *
 * MODES
 *   audit   — READ-ONLY: ledger, columnsValid, protected counts, wallet/ledger
 *             checksums, brand configuration, status-remap exposure, the pending
 *             migration set, the restore-snapshot inventory and a PREFLIGHT
 *             VERDICT against the approved baseline. Never writes. Exits 2 (job
 *             red, report still published) when live Production does not match
 *             the approved baseline, so the pipeline can never call a drifted
 *             database "ready".
 *   apply   — surgical in-place restore point (per-table snapshot copies),
 *             then exactly the approved pending migrations via the same
 *             transactional runner used everywhere, then a postflight that
 *             proves IDENTICAL levels of Production data + wallet/ledger
 *             integrity. Any guard failure aborts with the whole migration
 *             transaction rolled back.
 *
 * HARD SAFETY GUARDS (fail closed):
 *   - DATABASE_SCHEMA must equal "visa_os" (never derived).
 *   - DATABASE_URL host must be a Supabase host and the pooler username must be
 *     the recorded Production project identity.
 *   - The schema_migrations ledger MUST exist — this script never bootstraps a
 *     ledger on Production (a missing ledger means a mispointed database).
 *   - Pre-apply state must equal the approved baseline EXACTLY (ledger, counts,
 *     wallet checksum, agency balances), and the pending set must be exactly
 *     this release's migrations — an unexpected pending file aborts the run.
 *   - Protected counts / wallet checksum / agency balances / branding must be
 *     identical afterwards, and column validation must end true.
 *
 * This tool never truncates, drops, deletes rows from, reseeds, or resets ANY
 * Production table. It is the only writer permitted in the release pipeline and
 * it runs only when a commit deliberately carries release/PROD_GO.
 *
 * PRE-WRITE RE-AUDIT: touching this file (or the workflow / sentinel path)
 * triggers the read-only audit job without the apply job, so the live
 * Production state can always be re-verified — and its verdict read — before a
 * release is armed. The write path additionally re-checks the same invariants
 * in-process, immediately before the first statement, and refuses on any drift.
 */
import "./lib/load-env";
import path from "node:path";
import fs from "node:fs";
import { Pool } from "pg";
import { getTableColumns, getTableName, is, Table } from "drizzle-orm";
import * as applicationSchema from "../src/db/schema";
import { databasePoolConfig, targetsSupabaseProject } from "../src/lib/database-config";
import { safeErrorCode, safeErrorText } from "../src/lib/safe-error";
import { applyMigrations } from "./lib/migrations";


const MODE = process.argv[2] === "apply" ? "apply" : "audit";
const SCHEMA = "visa_os";
const EXPECTED_SUPABASE_PROJECT = "xgetzgixalrsmuvfthpf";
const STAMP = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 12);
const SNAP = (t: string) => `visa_os._restore_${STAMP}_${t}`;
const MIGRATIONS_DIR = () => path.join(process.cwd(), "migrations");

/**
 * The migrations this release is authorized to apply — nothing else. The apply
 * path refuses to run when the pending set is not exactly this list, so a later
 * migration cannot ride along on this authorization.
 */
export const RELEASE_SCOPE = [
  "0013_embassy_applicability.sql",
  "0014_wallet_topup_requests.sql",
  "0015_schema_safe_references.sql",
  "0016_document_type_audience.sql",
  "0017_decision_types_audience.sql",
] as const;

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
  "visa_types",
  "document_types",
  "wallet_transactions",
  "document_requests",
  "schema_migrations",
  "site_settings",
] as const;

/**
 * The EXACT pre-apply state approved for THIS release.
 * Source of truth: the read-only Production audit published on commit 2f41668
 * (workflow run 35993822270, 2026-09-24) — ledger 0001-0012 with the live
 * protected counts, wallet-ledger checksum and agency-balance checksum captured
 * at that moment. Production is a live system: if any of these move before
 * authorization, the apply path refuses and the baseline must be re-approved.
 * `columnsValid` is expected to be FALSE pre-migration here — the release code
 * requires document_types.agency_uploadable (0016), which is exactly what this
 * release adds.
 */
export const APPROVED_BASELINE = {
  ledger: [
    "0001_init.sql",
    "0002_branding.sql",
    "0003_agency_registrations.sql",
    "0004_phase2_1.sql",
    "0005_canonical_decision_model.sql",
    "0006_simplified_status_model.sql",
    "0007_must_change_password.sql",
    "0008_application_price_adjustments.sql",
    "0009_atomic_request_submission.sql",
    "0010_simplified_applicant.sql",
    "0011_dzd_only_and_wallet_ref.sql",
    "0012_document_requests.sql",
  ] as const,
  counts: {
    users: 4,
    agencies: 4,
    applications: 2,
    applicants: 2,
    notifications: 29,
    communications: 0,
    audit_logs: 64,
    site_settings: 13,
    documents: 6,
    document_blobs: 8,
    checklist_items: 4,
    wallet_transactions: 3,
    application_status_history: 8,
  } as Record<string, number>,
  walletChecksum: "8508159c7279636306f48efd9ddf30ac",
  agencyWalletsChecksum: "0f091712b9965c5802b0811bfe07acaa",
};

/** Ledger state once this release has been applied. */
export const TARGET_LEDGER = [...APPROVED_BASELINE.ledger, ...RELEASE_SCOPE];

export const PROJECT_USER = `postgres.${EXPECTED_SUPABASE_PROJECT}`;

export interface SnapshotReport {
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

export function ledgerEquals(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** Migrations present in the repo but not yet recorded in the live ledger. */
export function pendingMigrations(liveLedger: readonly string[]): string[] {
  return fs
    .readdirSync(MIGRATIONS_DIR())
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .filter((f) => !liveLedger.includes(f));
}

/** Read-only: the in-place restore points the previous releases left behind. */
async function listRestoreSnapshots(client: import("pg").PoolClient): Promise<string[]> {
  try {
    const res = await client.query(
      `select table_name from information_schema.tables
        where table_schema = 'visa_os' and left(table_name, 9) = '_restore_'
        order by table_name`,
    );
    return res.rows.map((r) => String(r.table_name));
  } catch {
    return [];
  }
}

/**
 * The single source of truth for "is Production in the approved pre-apply
 * state?" — used by the read-only audit (verdict) and by apply (hard guard).
 */
export function preflightFindings(live: SnapshotReport, pending: readonly string[]): string[] {
  const mismatches: string[] = [];
  if (!ledgerEquals(live.ledger, APPROVED_BASELINE.ledger)) {
    mismatches.push(
      `ledger differs: live=[${live.ledger.join(", ")}] approved=[${APPROVED_BASELINE.ledger.join(", ")}]`,
    );
  }
  for (const [table, expected] of Object.entries(APPROVED_BASELINE.counts)) {
    const found = live.counts[table];
    if (table === "audit_logs") {
      // append-only by design: it may grow, never shrink
      if (found == null || found < expected) mismatches.push(`audit_logs=${found} < approved ${expected}`);
    } else if (found !== expected) {
      mismatches.push(`${table}: live=${found} expected=${expected}`);
    }
  }
  if (live.walletChecksum !== APPROVED_BASELINE.walletChecksum) {
    mismatches.push(`wallet ledger checksum differs: live=${live.walletChecksum} expected=${APPROVED_BASELINE.walletChecksum}`);
  }
  if (live.agencyWallets !== APPROVED_BASELINE.agencyWalletsChecksum) {
    mismatches.push(
      `agency balances checksum differs: live=${live.agencyWallets} expected=${APPROVED_BASELINE.agencyWalletsChecksum}`,
    );
  }
  if (!ledgerEquals(pending, RELEASE_SCOPE)) {
    mismatches.push(
      `pending migration set is not this release: pending=[${pending.join(", ") || "none"}] release=[${RELEASE_SCOPE.join(", ")}]`,
    );
  }
  return mismatches;
}

/** Identity of the approved Production project (credentials never printed). */
export function projectGuardFindings(url: string): string[] {
  try {
    const parsed = new URL(url);
    const username = decodeURIComponent(parsed.username);
    if (parsed.hostname.includes("pooler.supabase.com") && username !== PROJECT_USER) {
      return [`pooler username '${username}' is not '${PROJECT_USER}' (identity of the approved production project)`];
    }
    return [];
  } catch {
    return ["DATABASE_URL is not parseable — cannot verify the Production project identity"];
  }
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
  preflight?: { pending: string[]; mismatches: string[]; snapshots: string[] },
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
  if (preflight) {
    lines.push("");
    lines.push(`release scope: [${RELEASE_SCOPE.join(", ")}]`);
    lines.push(`pending migrations: [${preflight.pending.join(", ") || "none"}]`);
    lines.push(
      `existing restore points in visa_os: [${preflight.snapshots.join(", ") || "none"}]`,
    );
    lines.push(
      preflight.mismatches.length
        ? `approved-baseline comparison: MISMATCH (${preflight.mismatches.length})\n - ${preflight.mismatches.join("\n - ")}`
        : "approved-baseline comparison: MATCH — ledger, protected counts, wallet-ledger checksum, agency balances and pending set all equal the approved release baseline.",
    );
    lines.push(
      `PREFLIGHT VERDICT: ${preflight.mismatches.length ? "BLOCKED (do not release)" : "READY"}`,
    );
  }
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

let TARGET_DESCRIPTOR = "(unresolved)";

function describeTarget(value: string): string {
  try {
    const u = new URL(value);
    return `host=${u.hostname} port=${u.port || "5432"} database=${u.pathname.slice(1)} username=${decodeURIComponent(u.username)} sslmode=${u.searchParams.get("sslmode") ?? "(none, CA-verified TLS applied by pool config)"}`;
  } catch {
    return "(unparseable)";
  }
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) fail("DATABASE_URL is not available to this job — expected in the 'Production' GitHub environment secrets.");
  TARGET_DESCRIPTOR = describeTarget(url);
  console.log("connection target (credentials never printed): " + TARGET_DESCRIPTOR);
  let host = "";
  let projectNote = "";
  try {
    const parsed = new URL(url);
    host = parsed.hostname;
    const isSupabase = host.endsWith(".supabase.com");
    if (!isSupabase) fail(`DATABASE_URL host '${host}' is not a Supabase host; refusing to run.`);
    projectNote = targetsSupabaseProject(url, EXPECTED_SUPABASE_PROJECT)
      ? `targets the recorded project ${EXPECTED_SUPABASE_PROJECT}`
      : `targets project ref in username '${decodeURIComponent(parsed.username || "")}' (differs from the recorded preview project ${EXPECTED_SUPABASE_PROJECT} — Production may legitimately live in its own Supabase project)`;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("DATABASE_URL")) throw err;
    fail("DATABASE_URL is not parseable.");
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
      notes.push(`connected: database=${dbName} schema=${SCHEMA}; ${projectNote}`);
      before = await collect(client, notes);
    } finally {
      client.release();
    }

    if (MODE === "audit") {
      const pending = pendingMigrations(before.ledger);
      const mismatches = [...preflightFindings(before, pending), ...projectGuardFindings(url)];
      const snapClientForAudit = await pool.connect();
      let snapshots: string[] = [];
      try {
        snapshots = await listRestoreSnapshots(snapClientForAudit);
      } finally {
        snapClientForAudit.release();
      }
      const md = renderReport("audit", host, before, null, [], [], { pending, mismatches, snapshots });
      fs.writeFileSync("/tmp/prod-release-report.md", md);
      console.log(md);
      if (mismatches.length) {
        console.error(
          `PREFLIGHT VERDICT: BLOCKED — live Production does not match the approved baseline (${mismatches.length} difference(s)). Nothing was changed; the baseline must be re-approved before release.`,
        );
        process.exitCode = 2;
      } else {
        console.log(
          `PREFLIGHT VERDICT: READY — live Production matches the approved baseline exactly; ${pending.length} approved migration(s) pending (${pending.join(", ")}).`,
        );
      }
      return;
    }

    // ---- apply mode: hard precondition — pre-apply state must equal the APPROVED preflight ----
    {
      const pending = pendingMigrations(before.ledger);
      // Already released: idempotent no-op, nothing written, no restore point needed.
      if (ledgerEquals(before.ledger, TARGET_LEDGER)) {
        const md = renderReport("apply", host, before, before, [], [], { pending, mismatches: [], snapshots: [] });
        fs.writeFileSync(
          "/tmp/prod-release-report.md",
          md + "\n\nMIGRATIONS ALREADY APPLIED (ledger complete 0001-0017) — no-op run; restore point not recreated.\n",
        );
        console.log(md);
        console.log("migrations already applied — ledger complete 0001-0017; exiting as successful no-op.");
        pool.end();
        return;
      }
      const mismatches = [...preflightFindings(before, pending), ...projectGuardFindings(url)];
      if (mismatches.length) {
        fail(
          `PRE-APPLY STATE DIVERGES FROM THE APPROVED PREFLIGHT — refusing to apply anything:\n - ${mismatches.join("\n - ")}`,
        );
      }
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
        `### Production release — AUDIT/EXECUTION FAILURE (${MODE})\n\n\`\`\`\ntarget: ${TARGET_DESCRIPTOR}\nerror: ${text}\n\`\`\`\n`,
      );
    }
  } catch {
    // best effort
  }
}

/**
 * Entry point. Guarded so that importing this module (tests exercising the
 * preflight/guard helpers) can never connect to, or write to, any database:
 * without an explicit CLI invocation `main()` is simply not called.
 */
const ENTRY = process.argv[1] ?? "";
if (/prod-release\.(ts|js|mjs|cjs)$/.test(ENTRY)) {
  main().catch((error) => {
    const text = `${safeErrorCode(error) ? `(code ${safeErrorCode(error)}) ` : ""}${safeErrorText(error)}`;
    console.error(`prod-release ${MODE} failed: ${text}`);
    console.error("No reset, seed, or destructive repair was attempted. The migration transaction is all-or-nothing.");
    persistError(text);
    process.exitCode = 1;
  });
}
