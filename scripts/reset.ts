/* eslint-disable no-console -- Standalone CLI emits its reviewable JSON report to stdout. */
/** Dry-run by default. Never invoke a real go-live reset during candidate hardening. */
import { Pool } from "pg";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { databasePoolConfig } from "../src/lib/database-config";
import { assertDryRunTarget, cleanupPolicy, dependencyDeleteOrder, parseResetOptions, verifyPreviewResetIdentity, type VerifiedPreviewResetIdentity } from "./lib/reset-plan";
import { executeVerifiedLocalReset, verifiedResetPlan } from "./lib/reset-executor";

async function main() {
  const options = parseResetOptions(process.argv.slice(2));
  if (options.blueprint) { console.log(JSON.stringify({ ...cleanupPolicy, mode: "OFFLINE_BLUEPRINT", executionAvailable: true, productionExecutionAvailable: false }, null, 2)); return; }
  let preview: VerifiedPreviewResetIdentity | undefined;
  let target;
  if(options.isolatedPreview) {
    const manifest = JSON.parse(await readFile(options.approvalManifest!, "utf8"));
    if(manifest.authorization?.purpose!=="ISOLATED_PREVIEW_GO_LIVE_CLEANUP" || !manifest.previewIdentity) throw new Error("Dedicated isolated Preview authorization is required.");
    const git = (args: string[]) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore","pipe","pipe"] }).trim();
    const origin = git(["remote","get-url","origin"]);
    const repository = /^(https:\/\/github\.com\/|git@github\.com:)essafariatravel\/newproject(?:\.git)?$/.test(origin) ? "essafariatravel/newproject" : "UNIDENTIFIED";
    target = assertDryRunTarget(process.env, { isolatedPreview:true, previewIdentity:manifest.previewIdentity,
      gitIdentity:{branch:git(["branch","--show-current"]),sha:git(["rev-parse","HEAD"]),clean:git(["status","--porcelain"])==="",repository} });
    preview = await verifyPreviewResetIdentity(manifest.previewIdentity, process.env.RESET_VERCEL_ACCESS_TOKEN);
  } else target = assertDryRunTarget(process.env);
  if (options.execute && (!options.approvalManifest || process.env.STORAGE_PROVIDER !== "db")) throw new Error("A reviewed approval manifest and verified database storage are required.");
  const pool = new Pool(databasePoolConfig(process.env));
  const client = await pool.connect();
  try {
    // Execution must obtain a fresh snapshot after its exclusive table locks.
    // SERIALIZABLE/REPEATABLE READ would reuse the initial verification snapshot
    // and miss a writer committed while this transaction waited for the locks.
    await client.query(options.execute ? "begin isolation level read committed" : "begin transaction isolation level repeatable read read only");
    await client.query("set local lock_timeout='10s'"); await client.query("set local statement_timeout='5min'");
    const plan = await verifiedResetPlan(client, target.schema, options.approvalManifest, preview);
    if (options.execute) {
      const result = await executeVerifiedLocalReset(client, plan); await client.query("commit"); console.log(JSON.stringify(result, null, 2));
    } else {
      let dependencyAwareDeleteOrder: string[] = [];
      try { dependencyAwareDeleteOrder = dependencyDeleteOrder(plan.inventory.tables, plan.inventory.edges); } catch { /* Archive/recreate avoids immutable-parent deletion and dependency cycles. */ }
      const users = plan.inventory.tableRows.users;
      if (!users) throw new Error("Unknown preserved identity inventory.");
      const approved = users.filter(row => (plan.manifest?.preservedUserIds ?? options.preserveUsers).includes(String(row.id)));
      const blockers = plan.manifest ? [] : ["A verified encrypted backup, isolated restore and explicit reviewed approval manifest are required for execution."];
      console.log(JSON.stringify({ mode: "DRY_RUN_READ_ONLY", executionAvailable: true, schema: target.schema, counts: plan.inventory.counts,
        inventorySha256: plan.inventory.inventorySha256, definitionSha256: plan.inventory.definitionSha256,
        dependencyAwareDeleteOrder, preservedStaffIds: plan.manifest?.preservedUserIds ?? approved.map(row => row.id),
        protectedCounts: { approvedStaff: approved.length, approvedActiveSuperAdmins: approved.filter(row => row.role === "SUPER_ADMIN" && row.status === "ACTIVE" && !row.agency_id).length },
        backupStatus: plan.backupStatus, effects: plan.effects,
        destructiveSteps: ["Lock all application tables; refuse stale inventory and cross-schema dependencies.",
          "Rename original schema to immutable-history archive; retain all original rows and blobs.",
          "Create clean operational schema from the exact verified migration bytes.",
          "Restore only approved Staff and configuration; revoke old sessions/tokens by incrementing credential version.",
          "Copy only explicitly preserved blobs into live schema; removed test objects remain recoverable in archive and encrypted backup.",
          "Preserve sequence counters; verify zero/preserved counts, definitions, archive bytes and references before commit."],
        preserveTables: cleanupPolicy.preserveTables, preservedRowRules: cleanupPolicy.preservedRowRules,
        storageCleanupPlan: cleanupPolicy.storageCleanupPlan, postResetVerification: cleanupPolicy.postResetVerification, ownerDecisions: cleanupPolicy.ownerDecisions, blockers }, null, 2));
      await client.query("rollback");
    }
  } finally { await client.query("rollback").catch(() => {}); client.release(); await pool.end(); }
}
main().catch((error: unknown) => {
  // Only known constant guard errors are safe to print. Database/IO errors can contain credentials or row data.
  const safeGuard = error instanceof Error && (/^Reset evidence failed verification: [a-z-]+\. No data was changed\.$/.test(error.message)
    || /^(Execution is disabled without one explicit reviewed approval manifest and an unambiguous --execute request\.|Production reset planning is forbidden\. Use a disposable local snapshot\.)$/.test(error.message));
  console.error(safeGuard ? (error as Error).message : "Reset evidence or target verification failed. No reset committed. Production is forbidden; no credentials are displayed.");
  process.exitCode = 1;
});
