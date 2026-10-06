/**
 * Production release tooling — visa_os.
 *
 * CURRENT APPROVED PRE-RELEASE STATE: Production ledger 0001 → 0019 with the explicitly authorized 0020 → 0031 migration scope pending.
 * Counts/checksums remain explicitly human-approved values: live drift is
 * NEVER adopted automatically. baseline-candidate is read-only evidence only.
 *
 * MODES
 *   audit   — READ-ONLY: ledger, columnsValid, protected counts, wallet/ledger
 *             checksums, brand configuration, status-remap exposure, the pending
 *             migration set, the restore-snapshot inventory and a PREFLIGHT
 *             VERDICT against the approved baseline. Never writes. Exits 2 (job
 *             red, report still published) when live Production does not match
 *             the approved baseline, so the pipeline can never call a drifted
 *             database "ready".
 *   baseline-candidate — READ-ONLY current baseline values plus limited
 *             record-review evidence. Never writes and never approves drift.
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
 *   - The live schema probe runs inside a transaction with a transaction-local
 *     search_path, so it cannot be fooled (or fail) on pooled session state.
 *   - The schema_migrations ledger MUST exist — this script never bootstraps a
 *     ledger on Production (a missing ledger means a mispointed database).
 *   - Live state must equal the approved baseline EXACTLY (ledger, counts,
 *     wallet checksum, agency balances), and the pending set must be exactly
 *     the authorized release scope — migrations 0020 through 0031. Any
 *     unexpected pending file aborts the run.
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
 * (A red audit never writes anything: the write job needs the sentinel AND a
 * green audit AND the in-process pre-apply re-check.)
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


export type ReleaseMode = "audit" | "baseline-candidate" | "apply";
export function resolveReleaseMode(value: string | undefined): ReleaseMode {
  if (value === "apply" || value === "baseline-candidate") return value;
  return "audit";
}
export function isReadOnlyMode(mode: ReleaseMode): boolean {
  return mode !== "apply";
}
const MODE = resolveReleaseMode(process.argv[2]);
export const PRODUCTION_SCHEMA = "visa_os";
export const EXPECTED_SUPABASE_PROJECT = "xgetzgixalrsmuvfthpf";
const SCHEMA = PRODUCTION_SCHEMA;
const STAMP = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 12);
const SNAP = (t: string) => `visa_os._restore_${STAMP}_${t}`;
const MIGRATIONS_DIR = () => path.join(process.cwd(), "migrations");

/**
 * The migrations this release is authorized to apply — nothing else. The apply
 * path refuses to run when the pending set is not exactly this list, so a later
 * migration cannot ride along on this authorization.
 */
export const RELEASE_SCOPE = [
  "0020_identity_security.sql",
  "0021_business_invariants.sql",
  "0022_registration_review.sql",
  "0023_operations_legal.sql",
  "0024_preview_api_lockdown.sql",
  "0025_legal_privacy_readiness.sql",
  "0026_function_privilege_hardening.sql",
  "0027_document_integrity.sql",
  "0028_file_identity_hardening.sql",
  "0029_legacy_reconciliation.sql",
  "0030_reconciliation_api_lockdown.sql",
  "0031_reconciliation_event_sequence_repair.sql",
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
  "sessions",
  "currencies",
  "visa_categories",
  "visa_types",
  "document_types",
  "documents",
  "document_blobs",
  "checklist_items",
  "wallet_transactions",
  "wallet_topup_requests",
  "document_requests",
  "agency_registrations",
  "agency_registration_documents",
  "audit_logs",
  "notifications",
  "schema_migrations",
  "site_settings",
] as const;

/**
 * The EXACT verified post-release Production state.
 * Ledger 0001-0019 is the approved schema state and no migrations are pending.
 * Counts/checksums remain explicit human-approved values; audit and
 * baseline-candidate can never auto-accept drift.
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
    "0013_embassy_applicability.sql",
    "0014_wallet_topup_requests.sql",
    "0015_schema_safe_references.sql",
    "0016_document_type_audience.sql",
    "0017_decision_types_audience.sql",
    "0018_session_presence.sql",
    "0019_config_translations.sql",
  ] as const,
  counts: {
    users: 6,
    agencies: 7,
    applications: 2,
    applicants: 2,
    notifications: 44,
    communications: 0,
    audit_logs: 93,
    site_settings: 19,
    documents: 6,
    document_blobs: 13,
    checklist_items: 4,
    wallet_transactions: 4,
    application_status_history: 8,
  } as Record<string, number>,
  walletChecksum: "9df70462ea533466b9b4c253d6208a89",
  agencyWalletsChecksum: "440e8a0490e41c5a57a5e96fc893abe3",
};

/** Current fully applied approved ledger. */
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

/**
 * Run work inside an explicit transaction with a TRANSACTION-LOCAL search path.
 *
 * Production is reached through a transaction-mode pooler: a session-level
 * `set search_path` is not guaranteed to be visible to the next statement (the
 * next transaction can be served by a different backend, where the path
 * silently reverts to the default), which is how the live schema probe once
 * resolved 'public'. `set local` inside a transaction is pinned to the backend
 * that serves that transaction, so anything that depends on the schema is
 * scoped here — the only form the pooler is required to preserve.
 */
async function inSchema<T>(
  client: import("pg").PoolClient,
  fn: (c: import("pg").PoolClient) => Promise<T>,
  readOnly = false,
): Promise<T> {
  await client.query(readOnly ? "begin read only" : "begin");
  try {
    await client.query(`set local search_path to ${SCHEMA}`);
    const out = await fn(client);
    await client.query("commit");
    return out;
  } catch (err) {
    try {
      await client.query("rollback");
    } catch {
      // the connection is already unusable; the original error is what matters
    }
    throw err;
  }
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
export function releaseManifestFindings(
  pending: readonly string[],
  releaseScope: readonly string[] = RELEASE_SCOPE,
): string[] {
  if (ledgerEquals(pending, releaseScope)) return [];
  return [
    `pending migration set is not this release: pending=[${pending.join(", ") || "none"}] release=[${releaseScope.join(", ")}]`,
  ];
}

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
  mismatches.push(...releaseManifestFindings(pending));
  return mismatches;
}

/** Identity of the approved Production project (credentials never printed). */
export function projectGuardFindings(url: string): string[] {
  try {
    const parsed = new URL(url);
    if (!targetsSupabaseProject(url, EXPECTED_SUPABASE_PROJECT)) {
      const username = decodeURIComponent(parsed.username);
      return [
        `database target host='${parsed.hostname}' username='${username}' is not the approved Production Supabase project '${EXPECTED_SUPABASE_PROJECT}'`,
      ];
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

export interface BaselineReview {
  walletTransactions: Array<Record<string, unknown>>;
  agencyBalances: Array<Record<string, unknown>>;
  recentNotifications: Array<Record<string, unknown>>;
}

async function collectBaselineReview(client: import("pg").PoolClient): Promise<BaselineReview> {
  const wallet = await client.query(
    `select id, reference, agency_id, application_id, type, amount::text, currency,
            balance_before::text, balance_after::text, reason, actor_id, created_at
       from visa_os.wallet_transactions order by created_at, id`,
  );
  const agencies = await client.query(
    `select id, legal_name, balance::text, currency, updated_at
       from visa_os.agencies order by legal_name, id`,
  );
  const notifications = await client.query(
    `select id, user_id, agency_id, application_id, type, link, read_at, created_at
       from visa_os.notifications order by created_at desc, id desc limit 20`,
  );
  return {
    walletTransactions: wallet.rows,
    agencyBalances: agencies.rows,
    recentNotifications: notifications.rows,
  };
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

function renderBaselineCandidate(
  head: string,
  snapshot: SnapshotReport,
  pending: string[],
  snapshots: string[],
  review: BaselineReview,
): string {
  const candidate = {
    ledger: snapshot.ledger,
    counts: snapshot.counts,
    walletChecksum: snapshot.walletChecksum,
    agencyWalletsChecksum: snapshot.agencyWallets,
  };
  return [
    "### Production baseline candidate — READ ONLY",
    "",
    "```",
    `host: ${head}`,
    `schema: ${SCHEMA}`,
    `release scope: [${RELEASE_SCOPE.join(", ")}]`,
    `pending migrations: [${pending.join(", ") || "none"}]`,
    `candidate baseline JSON: ${JSON.stringify(candidate)}`,
    `existing restore points: [${snapshots.join(", ") || "none"}]`,
    "",
    "REVIEW EVIDENCE — wallet transactions:",
    JSON.stringify(review.walletTransactions),
    "",
    "REVIEW EVIDENCE — agency balances:",
    JSON.stringify(review.agencyBalances),
    "",
    "REVIEW EVIDENCE — latest 20 notifications (content omitted):",
    JSON.stringify(review.recentNotifications),
    "",
    "CANDIDATE ONLY — NOT APPROVED. Update APPROVED_BASELINE in source only after human review.",
    "```",
  ].join("\n");
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
  const projectFindings = projectGuardFindings(url);
  if (projectFindings.length) fail(projectFindings.join("\n - "));
  projectNote = `targets the recorded project ${EXPECTED_SUPABASE_PROJECT}`;
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
      // Identity probe: must run in the same transaction as the `set local`, so
      // the answer is the *live* schema of this release's connection and can
      // never be a stale/default-schema artefact of the pooler.
      const readOnly = isReadOnlyMode(MODE);
      const collected = await inSchema(client, async (probe) => {
        const who = await probe.query("select current_database() as db, current_schema() as sc");
        if (who.rows[0].sc !== SCHEMA) {
          fail(
            `resolved schema is '${who.rows[0].sc}', expected '${SCHEMA}' — the live session is not in the ${SCHEMA} schema. Refusing to run.`,
          );
        }
        dbName = String(who.rows[0].db);
        const ledgerProbe = await probe.query(`select to_regclass('${SCHEMA}.schema_migrations') as t`);
        if (!ledgerProbe.rows[0].t) {
          fail("Production migration ledger is missing — this is not a managed Production database state. Nothing was changed.");
        }
        notes.push(`connected: database=${dbName} schema=${SCHEMA}; ${projectNote}`);
        return readOnly ? collect(probe, notes) : null;
      }, readOnly);
      before = collected ?? await collect(client, notes);
    } finally {
      client.release();
    }

    if (MODE === "audit" || MODE === "baseline-candidate") {
      const pending = pendingMigrations(before.ledger);
      const mismatches = preflightFindings(before, pending);
      const snapClientForAudit = await pool.connect();
      let snapshots: string[] = [];
      let review: BaselineReview | null = null;
      try {
        const inspection = await inSchema(snapClientForAudit, async (probe) => ({
          snapshots: await listRestoreSnapshots(probe),
          review: MODE === "baseline-candidate" ? await collectBaselineReview(probe) : null,
        }), true);
        snapshots = inspection.snapshots;
        review = inspection.review;
      } finally {
        snapClientForAudit.release();
      }
      if (MODE === "baseline-candidate") {
        const md = renderBaselineCandidate(
          host,
          before,
          pending,
          snapshots,
          review ?? { walletTransactions: [], agencyBalances: [], recentNotifications: [] },
        );
        fs.writeFileSync("/tmp/prod-release-report.md", md);
        console.log(md);
        console.log("BASELINE CANDIDATE GENERATED READ-ONLY — no Production data or approved baseline was changed.");
        return;
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
          `PREFLIGHT VERDICT: READY — live Production matches the approved baseline exactly; pending migrations: [${pending.join(", ") || "none"}].`,
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
          md + "\n\nMIGRATIONS ALREADY APPLIED (ledger complete 0001-0031) — no-op run; restore point not recreated.\n",
        );
        console.log(md);
        console.log("migrations already applied — ledger complete 0001-0031; exiting as successful no-op.");
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
      // No session-level `set search_path` here: every read in collect() is
      // explicitly schema-qualified (`visa_os.<table>`), so nothing depends on
      // pooled session state that the pooler may reset between statements.
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
