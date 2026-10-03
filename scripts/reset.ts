/** Read-only go-live cleanup inventory. Deletion is deliberately unavailable.
 * npm run db:reset -- --dry-run [--preserve-user UUID] [--backup-manifest PATH]
 * npm run db:reset -- --blueprint (offline; never opens a connection)
 */
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { databasePoolConfig } from "../src/lib/database-config";
import { assertDryRunTarget, cleanupPolicy, dependencyDeleteOrder, parseResetOptions } from "./lib/reset-plan";
import { qualifiedTable } from "../src/lib/database-schema";
import { PRODUCTION_PROJECT_REF, PRODUCTION_SCHEMA, assessBackupManifest, backupFreshnessFindings } from "./lib/dr-safety";

async function main() {
  const options = parseResetOptions(process.argv.slice(2));
  if (options.blueprint) {
    console.log(JSON.stringify({ mode: "OFFLINE_BLUEPRINT", executionAvailable: false, ...cleanupPolicy }, null, 2));
    return;
  }
  const target = assertDryRunTarget(process.env);
  const pool = new Pool(databasePoolConfig(process.env));
  const client = await pool.connect();
  try {
    await client.query("begin transaction read only");
    await client.query("set local statement_timeout='10s'");
    const tables = await client.query<{ name: string }>("select table_name as name from information_schema.tables where table_schema=$1 and table_type='BASE TABLE' order by table_name", [target.schema]);
    const counts: Record<string, number> = {};
    for (const { name } of tables.rows) {
      const result = await client.query(`select count(*)::int as total from ${qualifiedTable(name, target.schema)}`);
      counts[name] = Number(result.rows[0].total);
    }
    const edges = await client.query<{ child: string; parent: string; parentSchema: string }>(`
      select child.relname as child, parent.relname as parent, pn.nspname as "parentSchema"
      from pg_constraint c join pg_class child on child.oid=c.conrelid join pg_namespace cn on cn.oid=child.relnamespace
      join pg_class parent on parent.oid=c.confrelid join pg_namespace pn on pn.oid=parent.relnamespace
      where c.contype='f' and cn.nspname=$1`, [target.schema]);
    const approved = options.preserveUsers.length ? (await client.query<{ id: string; role: string; status: string; agency_id: string | null }>(
      `select id,role,status,agency_id from ${qualifiedTable("users", target.schema)} where id=any($1::uuid[])`, [options.preserveUsers])).rows : [];
    const activeSuper = approved.filter((user) => user.role === "SUPER_ADMIN" && user.status === "ACTIVE" && user.agency_id === null).length;
    const blockers = ["Execution is disabled in this release. A separate owner-authorized executor is required."];
    if (!activeSuper) blockers.push("Explicitly preserve at least one real active SUPER_ADMIN UUID.");
    if (approved.length !== options.preserveUsers.length || approved.some((user) => user.agency_id !== null)) blockers.push("Every preserved user must resolve to a real Staff identity.");
    if (edges.rows.some((edge) => edge.parentSchema !== target.schema)) blockers.push("Cross-schema dependencies require manual review before cleanup.");
    let backupStatus: "MISSING" | "INVALID" | "CREATED" | "VERIFIED" = "MISSING";
    let backupFindings: string[] = [];
    if (options.backupManifest) {
      try {
        const manifest = JSON.parse(await readFile(options.backupManifest, "utf8"));
        const assessment = assessBackupManifest(manifest, {
          environment: "PRODUCTION",
          projectRef: PRODUCTION_PROJECT_REF,
          schema: PRODUCTION_SCHEMA,
        });
        backupStatus = assessment.status;
        backupFindings = [...assessment.findings];
        if (assessment.manifest) {
          backupFindings.push(...backupFreshnessFindings(assessment.manifest, 24));
          if (backupFindings.length && backupStatus === "VERIFIED") backupStatus = "INVALID";
        }
      } catch {
        backupStatus = "INVALID";
        backupFindings = ["backup manifest could not be read or parsed"];
      }
    }
    if (backupStatus !== "VERIFIED") blockers.push("A fresh (<=24h) VERIFIED encrypted Production backup with an isolated restore, wallet reconciliation, storage reconciliation and tenant-isolation check is required.");
    const candidates = cleanupPolicy.removeOperationalTables.filter((name) => name in counts);
    let deleteOrder: string[] = [];
    try { deleteOrder = dependencyDeleteOrder(candidates, edges.rows.filter((edge) => edge.parentSchema === target.schema)); }
    catch { blockers.push("Dependency cycles need an explicit constraint-safe cleanup design; no deletion order is approved."); }
    const unclassified = Object.keys(counts).filter((name) => !candidates.includes(name) && !cleanupPolicy.preserveTables.includes(name));
    if (unclassified.length) blockers.push("Unclassified tables remain preserved until owner review.");
    if ((counts.audit_logs ?? 0) > 0) blockers.push("Immutable audit foreign keys can retain operational parents. Approve an encrypted synthetic-history archive/removal policy before expecting zero operational rows.");
    if ((counts.wallet_transactions ?? 0) + (counts.application_price_adjustments ?? 0) > 0) blockers.push("Immutable financial history needs a separately approved archive/removal design; ordinary DELETE is rejected by its triggers.");
    const protectedDependencies = edges.rows.filter((edge) => candidates.includes(edge.parent) && !candidates.includes(edge.child) && (counts[edge.child] ?? 0) > 0);
    if (protectedDependencies.length) blockers.push("Preserved table rows still reference proposed cleanup parents; review these dependencies before any future executor.");
    const columns = await client.query<{ table_name: string; column_name: string }>("select table_name,column_name from information_schema.columns where table_schema=$1", [target.schema]);
    const hasColumn = (table: string, column: string) => columns.rows.some((row) => row.table_name === table && row.column_name === column);
    const referenceSources = [["documents", "storage_key"], ["agency_registration_documents", "storage_key"], ["wallet_topup_requests", "proof_storage_key"]]
      .filter(([table, column]) => hasColumn(table!, column!));
    const referenceQuery = referenceSources.map(([table, column]) => `select "${column}" as key from ${qualifiedTable(table!, target.schema)} where "${column}" is not null`).join(" union ");
    const referencedKeys = referenceQuery ? Number((await client.query(`select count(*)::int as total from (${referenceQuery}) refs`)).rows[0].total) : 0;
    const blobInventory = hasColumn("document_blobs", "size_bytes") ? (await client.query(`select count(*)::int as objects,coalesce(sum(size_bytes),0)::text as bytes from ${qualifiedTable("document_blobs", target.schema)}`)).rows[0] : null;
    const storageInventory = { provider: process.env.STORAGE_PROVIDER === "supabase" ? "supabase" : "db", distinctOperationalReferences: referencedKeys,
      databaseBlobObjects: blobInventory ? Number(blobInventory.objects) : null, databaseBlobBytes: blobInventory?.bytes ?? null,
      externalObjectInventory: "NOT_FETCHED: separate owner-approved object manifest required", customerFileContentsRead: false };
    console.log(JSON.stringify({ mode: "DRY_RUN_READ_ONLY", executionAvailable: false, schema: target.schema,
      counts, dependencyAwareDeleteOrder: deleteOrder, preservedStaffIds: approved.map((user) => user.id),
      protectedCounts: { approvedStaff: approved.length, approvedActiveSuperAdmins: activeSuper,
        workflowStatuses: counts.statuses ?? 0, workflowTransitions: counts.status_transitions ?? 0,
        documentTypes: counts.document_types ?? 0, priorities: counts.priorities ?? 0, legalVersions: counts.legal_versions ?? 0, auditRows: counts.audit_logs ?? 0 },
      preserveTables: cleanupPolicy.preserveTables, unclassifiedPreservedTables: unclassified,
      preservedRowRules: cleanupPolicy.preservedRowRules, protectedDependencies,
      backupStatus, backupFindings, storageInventory, storageCleanupPlan: cleanupPolicy.storageCleanupPlan,
      postResetVerification: cleanupPolicy.postResetVerification, ownerDecisions: cleanupPolicy.ownerDecisions, blockers }, null, 2));
    await client.query("rollback");
  } finally {
    await client.query("rollback").catch(() => {});
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  // Never print pg error objects/URIs: connection configuration can contain secrets.
  console.error(error instanceof Error && /Execution is disabled|Production reset planning|local disposable|must be supplied|Unknown reset option|Invalid preserved/.test(error.message) ? error.message : "Read-only reset inventory could not be produced. No data was changed.");
  process.exitCode = 1;
});
