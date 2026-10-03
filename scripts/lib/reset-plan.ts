import { databaseSchema } from "../../src/lib/database-schema";

export function parseResetOptions(args: string[]) {
  const options = { blueprint: false, preserveUsers: [] as string[], backupManifest: undefined as string | undefined };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (["--execute", "--force", "--yes", "--confirm"].includes(arg!)) throw new Error("Execution is disabled. This tool only produces a read-only cleanup plan.");
    if (arg === "--dry-run") continue;
    if (arg === "--blueprint") { options.blueprint = true; continue; }
    if (arg === "--preserve-user") {
      const id = args[++index] ?? "";
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error("Invalid preserved user UUID.");
      options.preserveUsers.push(id.toLowerCase()); continue;
    }
    if (arg === "--backup-manifest") { options.backupManifest = args[++index]; if (!options.backupManifest) throw new Error("Unknown reset option: backup manifest path required."); continue; }
    throw new Error("Unknown reset option. Use --dry-run or --blueprint.");
  }
  options.preserveUsers = [...new Set(options.preserveUsers)];
  return options;
}

export function assertDryRunTarget(env: Record<string, string | undefined>) {
  // Hosted/Production context is rejected before schema parsing so this tool
  // cannot even begin resolving a target under Production metadata.
  if (env.VERCEL_ENV === "production" || env.NODE_ENV === "production" || env.VERCEL) {
    throw new Error("Production reset planning is forbidden. Use a disposable local snapshot.");
  }
  const schema = databaseSchema(env);
  if (schema === "visa_os") throw new Error("Production reset planning is forbidden. Use a disposable local snapshot.");
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL must be supplied explicitly for a disposable local snapshot.");
  let url: URL;
  try { url = new URL(env.DATABASE_URL); } catch { throw new Error("Use a local disposable PostgreSQL snapshot."); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new Error("Use a local disposable PostgreSQL snapshot. Remote reset planning is disabled.");
  }
  return { schema };
}

/** Child rows precede referenced parents. Cycles fail closed for manual review. */
export function dependencyDeleteOrder(tables: readonly string[], edges: readonly { child: string; parent: string }[]): string[] {
  const pending = new Set(tables), ordered: string[] = [];
  while (pending.size) {
    const ready = [...pending].filter((table) => !edges.some((edge) => edge.parent === table && edge.child !== table && pending.has(edge.child))).sort();
    if (!ready.length) throw new Error("Cleanup dependency cycle requires manual review. No data was changed.");
    for (const table of ready) { pending.delete(table); ordered.push(table); }
  }
  return ordered;
}

export const cleanupPolicy = {
  removeOperationalTables: ["session_presence", "sessions", "account_access_tokens", "account_activation_tokens", "account_recovery_requests", "auth_rate_limits", "notifications", "communications", "wallet_topup_requests", "application_price_adjustments", "wallet_transactions", "application_status_history", "document_requests", "documents", "document_blobs", "checklist_items", "applicants", "applications", "agency_registration_followup_tokens", "agency_registration_requests", "agency_registration_history", "agency_registration_documents", "agency_registrations", "users", "agencies"],
  preserveTables: ["schema_migrations", "audit_logs", "site_settings", "legal_versions", "statuses", "status_transitions", "document_types", "priorities", "currencies", "countries", "visa_categories", "visa_types", "visa_requirements"],
  ownerDecisions: [
    "Confirm real SUPER_ADMIN/Staff UUIDs; usernames, historical audit identity and approved admin access remain protected.",
    "Approve launch countries/categories/visa products and requirements. Catalogue/configuration stays preserved until an explicit test-versus-launch inventory is approved.",
    "Preserve core statuses/transitions, system decision document types, priorities and DZD runtime primitives.",
    "Keep immutable audit and financial history in the verified encrypted archive. Removing pre-launch synthetic history requires separate owner/legal approval.",
    "Supply real legal content and company facts; preserve every approved legal version and its audit author.",
  ],
  preservedRowRules: {
    users: "Retain every explicitly approved real Staff UUID; refuse a future execution that leaves no active SUPER_ADMIN.",
    configuration: "Retain launch-approved catalogue, system primitives and settings. Unclassified rows remain protected.",
    history: "Immutable audit, legal and financial records require a verified archive and separate owner policy before any parent removal.",
  },
  storageCleanupPlan: [
    "Inventory dossier, decision, top-up receipt and registration storage keys from the snapshot; never print or fetch customer files during planning.",
    "Separate operational objects from logos and approved brand assets; retain uncertain objects.",
    "Verify encrypted object backup and restore with checksum/version manifest before future deletion.",
    "Database and object storage cannot share one commit: enqueue approved object keys for idempotent post-commit deletion, retry failures, and verify no live row references a key.",
  ],
  postResetVerification: {
    zeroExpected: ["agencies", "agency users", "applications", "applicants", "operational documents", "communications", "top-up requests", "test wallet transactions", "test sessions", "test registrations"],
    protected: ["approved active SUPER_ADMIN/Staff", "core statuses/transitions", "system decision document types", "priority defaults", "DZD primitives", "approved configuration/legal versions", "encrypted immutable-history archive"],
    checks: ["No dangling foreign keys or live file references", "Preserved Staff authenticate and old sessions/tokens remain invalid", "No retained account belongs to a removed tenant", "Storage reconciles against the approved manifest", "Record actual before/after counts and owner authorization; this plan reports no executed reset"],
  },
};
