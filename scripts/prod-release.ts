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
 *     the default authorized scope — 0020 through 0031. Qualified 0020–0033
 *     requires a separate expiring, exact-SHA/file owner approval. Any
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
import { spawnSync } from "node:child_process";
import { createRestorePoints, protectedContentDigests, sourceColumnProjection, discoverProtectedTables, assertCleanReleaseCheckout, verifyHardeningUpdates, digest, validateReleaseApproval, validateIndependentCustodyReceipt, QUALIFIED_RELEASE_SCOPE, QUALIFIED_BATCH_B_SCOPE, type ReleaseAuthorization } from "./lib/release-safeguards";
import {validateManagedBackupEvidence} from "./lib/release-recovery-policy";
import { privateArtifactPath } from "./lib/dr-private-path";
import { rootCertificates } from "node:tls";
import { SUPABASE_CA } from "../src/lib/supabase-ca";


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
export interface ReleaseBaseline {ledger:readonly string[];counts:Record<string,number>;walletChecksum:string;agencyWalletsChecksum:string;}
export type MigrationBatch="A"|"B";
export function releaseBatch(approval:ReleaseAuthorization|null):MigrationBatch {return approval?.version===2?approval.batch:"A";}
export function batchBaseline(batch:MigrationBatch):ReleaseBaseline {return {...APPROVED_BASELINE,ledger:batch==="B"?[...APPROVED_BASELINE.ledger,...QUALIFIED_RELEASE_SCOPE]:APPROVED_BASELINE.ledger};}
export function batchDirectory(batch:MigrationBatch):string {return path.join(MIGRATIONS_DIR(),...(batch==="B"?["candidates"]:[]));}
export interface BatchPostflightReceipt {
 version:1;kind:"ESSAFARIA_MIGRATION_BATCH_POSTFLIGHT";status:"COMMITTED_POSTFLIGHT_PASS";batch:MigrationBatch;
 candidateSha:string;projectRef:string;schema:string;checkedAt:string;ledger:string[];migrations:Record<string,string>;
 counts:Record<string,number|null>;walletChecksum:string|null;agencyWallets:string|null;originalContentVerified:true;
}
export function validateBatchPostflight(value:unknown,batch:MigrationBatch,sha:string,now=Date.now()):BatchPostflightReceipt {
 const r=value as BatchPostflightReceipt,scope=batch==="A"?QUALIFIED_RELEASE_SCOPE:QUALIFIED_BATCH_B_SCOPE;
 const target=[...batchBaseline(batch).ledger,...scope],at=Date.parse(r?.checkedAt);
 if(!r||r.version!==1||r.kind!=="ESSAFARIA_MIGRATION_BATCH_POSTFLIGHT"||r.status!=="COMMITTED_POSTFLIGHT_PASS"||r.batch!==batch||r.candidateSha!==sha||!/^[a-f0-9]{40}$/.test(sha)||r.projectRef!==EXPECTED_SUPABASE_PROJECT||r.schema!==SCHEMA||!Number.isFinite(at)||at>now||now-at>24*3600000||r.originalContentVerified!==true||!ledgerEquals(r.ledger??[],target)||!r.migrations||!ledgerEquals(Object.keys(r.migrations).sort(),scope))throw new Error("Exact fresh committed batch postflight receipt is required.");
 for(const name of scope)if(digest(fs.readFileSync(path.join(batchDirectory(batch),name)))!==r.migrations[name])throw new Error("Prior batch migration digest differs from this candidate.");
 const findings=preflightFindings({counts:r.counts,walletChecksum:r.walletChecksum,agencyWallets:r.agencyWallets,ledger:r.ledger} as SnapshotReport,[],[],{...APPROVED_BASELINE,ledger:target});
 if(findings.length)throw new Error("Batch postflight does not preserve the original Production baseline.");
 return r;
}

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
export function alreadyAppliedFindings(pending:readonly string[]):string[] {
  return pending.length ? ["Already-applied release has unexpected pending migrations."] : [];
}

/** Migrations present in the repo but not yet recorded in the live ledger. */
export function pendingMigrations(liveLedger: readonly string[],directory=MIGRATIONS_DIR()): string[] {
  return fs
    .readdirSync(directory)
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

export function preflightFindings(live: SnapshotReport, pending: readonly string[], releaseScope: readonly string[] = RELEASE_SCOPE,baseline:ReleaseBaseline=APPROVED_BASELINE): string[] {
  const mismatches: string[] = [];
  if (!ledgerEquals(live.ledger, baseline.ledger)) {
    mismatches.push(
      `ledger differs: live=[${live.ledger.join(", ")}] approved=[${baseline.ledger.join(", ")}]`,
    );
  }
  for (const [table, expected] of Object.entries(baseline.counts)) {
    const found = live.counts[table];
    if (table === "audit_logs") {
      // append-only by design: it may grow, never shrink
      if (found == null || found < expected) mismatches.push(`audit_logs=${found} < approved ${expected}`);
    } else if (found !== expected) {
      mismatches.push(`${table}: live=${found} expected=${expected}`);
    }
  }
  if (live.walletChecksum !== baseline.walletChecksum) {
    mismatches.push(`wallet ledger checksum differs: live=${live.walletChecksum} expected=${baseline.walletChecksum}`);
  }
  if (live.agencyWallets !== baseline.agencyWalletsChecksum) {
    mismatches.push(
      `agency balances checksum differs: live=${live.agencyWallets} expected=${baseline.agencyWalletsChecksum}`,
    );
  }
  mismatches.push(...releaseManifestFindings(pending, releaseScope));
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
export function guardedProductionPoolConfig(env:Record<string,string|undefined> = process.env):import("pg").PoolConfig {
  if (env.DATABASE_SCHEMA !== PRODUCTION_SCHEMA) throw new Error("Production schema must be exactly visa_os.");
  const config = databasePoolConfig(env, true);
  if (!config.connectionString || projectGuardFindings(config.connectionString).length) throw new Error("Effective Production database project identity is invalid.");
  const uri = new URL(config.connectionString);
  if(uri.pathname!=="/postgres")throw new Error("Production database must be exactly postgres.");
  // pg query parameters override authority fields and the pinned search_path.
  // Only accept TLS parameters, then remove them so the verified TLS config wins.
  for (const key of [...uri.searchParams.keys()]) {
    if (!/^ssl/i.test(key) && key !== "uselibpqcompat") throw new Error("Production database URI contains unsupported connection parameters.");
    uri.searchParams.delete(key);
  }
  return {...config, connectionString:uri.href, ssl:{rejectUnauthorized:true,ca:[...rootCertificates,SUPABASE_CA]}};
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

export async function collectReleaseSnapshot(client: import("pg").PoolClient, notes: string[],batch:MigrationBatch="A"): Promise<SnapshotReport> {
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
    await client.query("savepoint column_validation");
    for (const table of Object.values(applicationSchema)) {
      if (!is(table, Table)) continue;
      const columns = Object.values(getTableColumns(table)).map((c) => `"${c.name.replaceAll('"', '""')}"`);
      await client.query(`select ${columns.join(", ")} from "visa_os"."${getTableName(table)}" limit 0`);
    }
    // These SQL-managed security/legal tables are not part of the Drizzle exports.
    const required:Record<string,string>={mfa_credentials:"user_id,encrypted_secret,confirmed_at,recovery_hashes,last_epoch",mfa_enrollment_authorizations:"user_id,code_hash,expires_at,issued_by"};
    if(batch==="B")Object.assign(required,{document_retention_policy:"retention_days,execution_enabled,all_live_copies_covered",document_retention_case_events:"event_sequence,legal_hold,application_id",document_retention_receipts:"manifest_sha256,coverage_fingerprint,purged_at",legal_acceptances:"legal_version_id,content_sha256,user_id,accepted_at"});
    for(const [table,columns] of Object.entries(required))await client.query(`select ${columns} from visa_os.${table} limit 0`);
    const security=await client.query("select c.relname,c.relrowsecurity,exists(select 1 from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a left join pg_roles r on r.oid=a.grantee where (a.grantee=0 or r.rolname in ('anon','authenticated')) and a.privilege_type in ('SELECT','INSERT','UPDATE','DELETE')) exposed from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='visa_os' and c.relname=any($1::text[])",[Object.keys(required)]);
    if(security.rows.length!==Object.keys(required).length||security.rows.some(r=>!r.relrowsecurity||r.exposed))throw new Error("Release security/legal tables require RLS and no public client privileges.");
    report.columnsValid = true;
  } catch (err) {
    await client.query("rollback to savepoint column_validation");
    report.columnsValid = false;
    report.schemaError = `${safeErrorCode(err) ?? "?"}: ${safeErrorText(err).slice(0, 200)}`;
  } finally {
    await client.query("release savepoint column_validation");
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
export function diffReport(before: SnapshotReport, after: SnapshotReport): string[] {
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
  preflight?: { pending: string[]; mismatches: string[]; snapshots: string[]; scope?: readonly string[] },
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
    lines.push(`release scope: [${(preflight.scope ?? RELEASE_SCOPE).join(", ")}]`);
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

export async function runQualifiedReleaseTransaction(pool: Pool, hashes: Record<string,string>, directory = MIGRATIONS_DIR(), options:{batch?:MigrationBatch;baseline?:ReleaseBaseline;authorize?:()=>void}={}) {
  const notes: string[] = [];
  const releaseScope = Object.keys(hashes).sort();
  const batch=options.batch??"A",baseline=options.baseline??batchBaseline(batch);
  if(!ledgerEquals(releaseScope,batch==="A"?QUALIFIED_RELEASE_SCOPE:QUALIFIED_BATCH_B_SCOPE))throw new Error("Exact qualified batch scope is required.");
  const targetLedger = [...baseline.ledger, ...releaseScope];
  let before: SnapshotReport;
    let after: SnapshotReport | null = null;
    let projection: Record<string,string[]> = {};
    let contentBefore: Record<string,string> = {};
    const applied = await applyMigrations(pool, directory, SCHEMA, {
      hashes: hashes,
      before: async (client, pending) => {
        // Freeze protected source tables, then re-audit under the migration lock.
        // No data can race between snapshot, migration and integrity comparison.
        const protectedTables = await discoverProtectedTables(client);
        for (const table of [...protectedTables, "schema_migrations"].sort()) {
          const exists = await client.query("select to_regclass($1) as t", [`visa_os.${table}`]);
          if (exists.rows[0]?.t) await client.query(`lock table visa_os."${table}" in access exclusive mode`);
        }
        before = await collectReleaseSnapshot(client, notes,batch);
        const findings = preflightFindings(before, pending, releaseScope,baseline);
        if (findings.length) throw new Error("Locked preflight rejected; no release writes committed.");
        options.authorize?.();
        projection = await sourceColumnProjection(client, protectedTables,batch==="A");
        contentBefore = await protectedContentDigests(client, projection);
        before.snapshotTables = await createRestorePoints(client, protectedTables);
      },
      after: async client => {
        after = await collectReleaseSnapshot(client, notes,batch);
        const findings = diffReport(before, after);
        const contentAfter = await protectedContentDigests(client, projection);
        const changedTables = Object.keys(contentBefore).filter(table => contentBefore[table] !== contentAfter[table]);
        if (changedTables.length) findings.push(`Original protected column content changed: ${changedTables.join(",")}`);
        if(batch==="A")await verifyHardeningUpdates(client, before.snapshotTables);
        if(batch==="B"){
          const policy=(await client.query("select execution_enabled,retention_days,approved_at from visa_os.document_retention_policy")).rows;
          if(policy.length!==1||policy[0].execution_enabled!==false||policy[0].retention_days!==120||policy[0].approved_at!==null)throw new Error("Retention must remain disabled and unapproved after Batch B.");
        }
        if (findings.length || !after.columnsValid || !ledgerEquals(after.ledger, targetLedger)) {
          throw new Error(`Transactional postflight rejected; migrations and restore snapshots rolled back. Checks: ${findings.join(";")}; columnsValid=${after.columnsValid}; ledgerValid=${ledgerEquals(after.ledger, targetLedger)}`);
        }
      },
    });
    if (!after) throw new Error("Transactional postflight did not run.");
  return {before:before!, after:after as SnapshotReport, applied};
}

async function main(): Promise<void> {
  // Authorization and offline freshness checks precede even opening a DB pool.
  const approval = MODE === "apply" || (MODE === "audit" && fs.existsSync("release/PROD_GO")) ? loadApplyAuthorization() : null;
  const releaseScope: readonly string[] = approval ? Object.keys(approval.migrations).sort() : RELEASE_SCOPE;
  const batch=releaseBatch(approval),baseline=batchBaseline(batch),directory=batchDirectory(batch);
  const targetLedger = [...baseline.ledger, ...releaseScope];
  const url = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) fail("DATABASE_URL is not available to this job — expected in the 'Production' GitHub environment secrets.");
  TARGET_DESCRIPTOR = describeTarget(url);
  console.log("connection target (credentials never printed): " + TARGET_DESCRIPTOR);
  let host = "";
  let projectNote = "";
  try {
    const parsed = new URL(url);
    host = parsed.hostname;
    const isSupabase = targetsSupabaseProject(url, EXPECTED_SUPABASE_PROJECT);
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
  const pool = new Pool(guardedProductionPoolConfig());
  const notes: string[] = [];
  try {
    const client = await pool.connect();
    let dbName = "";
    let before: SnapshotReport;
    try {
      // Identity probe: must run in the same transaction as the `set local`, so
      // the answer is the *live* schema of this release's connection and can
      // never be a stale/default-schema artefact of the pooler.
      const readOnly = true;
      const collected = await inSchema(client, async (probe) => {
        const who = await probe.query("select current_database() as db, current_schema() as sc");
        if (who.rows[0].sc !== SCHEMA) {
          fail(
            `resolved schema is '${who.rows[0].sc}', expected '${SCHEMA}' — the live session is not in the ${SCHEMA} schema. Refusing to run.`,
          );
        }
        dbName = String(who.rows[0].db);
        if(dbName!=="postgres")fail("Production database identity must be exactly postgres.");
        const ledgerProbe = await probe.query(`select to_regclass('${SCHEMA}.schema_migrations') as t`);
        if (!ledgerProbe.rows[0].t) {
          fail("Production migration ledger is missing — this is not a managed Production database state. Nothing was changed.");
        }
        notes.push(`connected: database=${dbName} schema=${SCHEMA}; ${projectNote}`);
        return collectReleaseSnapshot(probe, notes,batch);
      }, readOnly);
      before = collected;
    } finally {
      client.release();
    }

    if (MODE === "audit" || MODE === "baseline-candidate") {
      const pending = pendingMigrations(before.ledger,directory);
      const mismatches = preflightFindings(before, pending, releaseScope,baseline);
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
      const md = renderReport("audit", host, before, null, [], [], { pending, mismatches, snapshots, scope:releaseScope });
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
      const pending = pendingMigrations(before.ledger,directory);
      // Already released: idempotent no-op, nothing written, no restore point needed.
      if (ledgerEquals(before.ledger, targetLedger)) {
        if (alreadyAppliedFindings(pending).length) throw new Error("Already-applied release has unexpected pending migrations.");
        if (!before.columnsValid) throw new Error("Already-applied ledger has invalid candidate columns.");
        const md = renderReport("apply", host, before, before, [], [], { pending, mismatches: [], snapshots: [] });
        fs.writeFileSync(
          "/tmp/prod-release-report.md",
          md + "\n\nMIGRATIONS ALREADY APPLIED — no-op run; restore point not recreated.\n",
        );
        console.log(md);
        console.log("migrations already applied — explicitly approved ledger complete; successful no-op.");
        return;
      }
      const mismatches = [...preflightFindings(before, pending, releaseScope,baseline), ...projectGuardFindings(url)];
      if (mismatches.length) {
        fail(
          `PRE-APPLY STATE DIVERGES FROM THE APPROVED PREFLIGHT — refusing to apply anything:\n - ${mismatches.join("\n - ")}`,
        );
      }
    }

    const transaction = await runQualifiedReleaseTransaction(pool, approval!.migrations,directory,{batch,authorize:()=>{loadApplyAuthorization();}});
    before = transaction.before;
    const {after, applied} = transaction;
    const receipt:BatchPostflightReceipt={version:1,kind:"ESSAFARIA_MIGRATION_BATCH_POSTFLIGHT",status:"COMMITTED_POSTFLIGHT_PASS",batch,candidateSha:approval!.candidateSha,projectRef:EXPECTED_SUPABASE_PROJECT,schema:SCHEMA,checkedAt:new Date().toISOString(),ledger:after.ledger,migrations:approval!.migrations,counts:after.counts,walletChecksum:after.walletChecksum,agencyWallets:after.agencyWallets,originalContentVerified:true};
    try{
      const receiptPath=privateArtifactPath(process.env.RELEASE_BATCH_POSTFLIGHT_FILE??"","Committed batch postflight output",{requireAbsolute:true});
      fs.writeFileSync(receiptPath,JSON.stringify(receipt,null,2)+"\n",{flag:"wx",mode:0o600});
      console.log(`COMMITTED batch ${batch}; postflight evidence SHA256=${digest(fs.readFileSync(receiptPath))}`);
    }catch{throw new Error("MIGRATIONS_COMMITTED_BUT_POSTFLIGHT_RECEIPT_WRITE_FAILED; inspect read-only, do not assume rollback or repeat writes.");}
    const findings = diffReport(before, after);
    const md = renderReport("apply", host, before, after, findings, applied);
    fs.writeFileSync("/tmp/prod-release-report.md", md);
    console.log(md);
    if (findings.length) {
      console.error("INTEGRITY VIOLATIONS — investigate before proceeding:", findings);
      process.exitCode = 3;
    }
    if (!(after as SnapshotReport).columnsValid) {
      console.error("Post-migration column validation still failing — NOT ready.");
      process.exitCode = 4;
    }
    if ((after as SnapshotReport).ledger.length < before.ledger.length) {
      console.error("Migration ledger shrank — unexpected; NOT ready.");
      process.exitCode = 5;
    }
  } finally {
    await pool.end();
  }
}

function loadApplyAuthorization(): ReleaseAuthorization {
  assertReleaseJobIdentity(process.env,MODE);
  const approvalFile = privateArtifactPath(process.env.RELEASE_APPROVAL_FILE ?? "", "Release approval", {requireAbsolute:true});
  const raw = fs.readFileSync(approvalFile);
  const approvalDigest = digest(raw);
  if (approvalDigest !== process.env.RELEASE_APPROVAL_SHA256) {
    throw new Error("Exact owner approval digest is required.");
  }
  const approval = validateReleaseApproval(JSON.parse(raw.toString("utf8")), {sha:process.env.GITHUB_SHA ?? "",ref:process.env.GITHUB_REF ?? ""});
  assertCleanReleaseCheckout(approval.candidateSha);
  const postflightOutput=privateArtifactPath(process.env.RELEASE_BATCH_POSTFLIGHT_FILE??"","Batch postflight output",{requireAbsolute:true});
  if(fs.existsSync(postflightOutput))throw new Error("Fresh committed batch postflight output is required before contacting Production.");
  fs.accessSync(path.dirname(postflightOutput),fs.constants.W_OK);
  // The nonce avoids a circular dependency between Git SHA and its own file.
  if (fs.readFileSync("release/PROD_GO", "utf8").trim() !== approval.authorizationId) throw new Error("PROD_GO does not match the exact owner authorization.");
  if(approval.version===2&&approval.batch==="B"){
    const raw=fs.readFileSync(privateArtifactPath(process.env.RELEASE_BATCH_A_POSTFLIGHT_FILE??"","Batch A postflight",{requireAbsolute:true}));
    if(digest(raw)!==approval.batchAPostflightSha256)throw new Error("Batch A postflight digest differs from owner approval.");
    validateBatchPostflight(JSON.parse(raw.toString("utf8")),"A",approval.batchACandidateSha!);
  }
  if(approval.version===2&&approval.recoveryPolicy.kind==="SUPABASE_MANAGED_PHYSICAL_V1"){
    const evidence=fs.readFileSync(privateArtifactPath(process.env.RELEASE_MANAGED_BACKUP_EVIDENCE??"","Managed physical backup evidence",{requireAbsolute:true}));
    if(digest(evidence)!==approval.recoveryPolicy.evidenceSha256)throw new Error("Managed backup evidence differs from the owner-selected policy.");
    const result=validateManagedBackupEvidence(JSON.parse(evidence.toString("utf8")),approval.recoveryPolicy);
    console.log(`${result.status}; independent restoration NOT_PERFORMED; no RESTORE_PASS claimed.`);
    return approval;
  }
  const recovery=approval.version===1?approval:approval.recoveryPolicy;
  if(!("verifiedManifestSha256" in recovery))throw new Error("Independent recovery evidence is required.");
  const manifest = privateArtifactPath(process.env.RELEASE_DR_VERIFIED_MANIFEST ?? "", "Verified DR manifest", {requireAbsolute:true});
  const bundle = privateArtifactPath(process.env.RELEASE_DR_EVIDENCE_BUNDLE ?? "", "DR evidence bundle", {requireAbsolute:true});
  const custody = privateArtifactPath(process.env.RELEASE_KEY_CUSTODY_RECEIPT ?? "", "Independent custody receipt", {requireAbsolute:true});
  const custodyRaw = fs.readFileSync(custody);
  if (digest(custodyRaw) !== recovery.custodyReceiptSha256) throw new Error("Independent custody receipt differs from owner approval.");
  validateIndependentCustodyReceipt(JSON.parse(custodyRaw.toString("utf8")));
  if (digest(fs.readFileSync(manifest)) !== recovery.verifiedManifestSha256 || digest(fs.readFileSync(bundle)) !== recovery.evidenceBundleSha256) {
    throw new Error("DR evidence files do not match owner approval.");
  }
  const gate = spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/dr-release-gate.ts", "--verified-manifest", manifest, "--evidence-bundle", bundle, "--expected-release-sha", approval.sourceReleaseSha, "--max-age-hours", "24"], {shell:false,windowsHide:true,encoding:"utf8",timeout:60000});
  if (gate.status !== 0) throw new Error("Fresh verified Production DR gate is blocked; no database contacted by apply.");
  return approval;
}

export function assertReleaseJobIdentity(env:Record<string,string|undefined>,mode:ReleaseMode):void {
 const allowed=["refs/heads/release/essafaria-prod-candidate-2026-10-10","refs/heads/release/essafaria-prod-candidate-2026-10-20"];
 if(env.GITHUB_ACTIONS!=="true"||env.GITHUB_REPOSITORY!=="essafariatravel/newproject"||env.GITHUB_REPOSITORY_ID!=="1375109458"||!allowed.includes(env.GITHUB_REF??"")||env.GITHUB_REF_PROTECTED!=="true"||env.GITHUB_WORKFLOW_REF!==`essafariatravel/newproject/.github/workflows/prod-release.yml@${env.GITHUB_REF}`||!(/^[a-f0-9]{40}$/).test(env.GITHUB_SHA??"")||!(env.GITHUB_EVENT_NAME==="push"||(mode!=="apply"&&env.GITHUB_EVENT_NAME==="workflow_dispatch")))throw new Error("Exact protected GitHub Production release job identity is required.");
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
