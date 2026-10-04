import { databaseSchema } from "../../src/lib/database-schema";
import { targetsSupabaseProject } from "../../src/lib/database-config";

export interface PreviewResetIdentity {
  projectRef: string; schema: string; branch: string; sha: string;
  vercelProjectId: string; vercelTeamId: string; deploymentId: string;
}
export interface ResetGitIdentity { branch: string; sha: string; clean: boolean; repository: string }
export type VerifiedPreviewResetIdentity = PreviewResetIdentity & { environment: "preview" };
const previewProject = "xgetzgixalrsmuvfthpf", previewSchema = "visa_os_preview", candidateBranch = "preprod/essafaria-final-hardening";
function validPreviewIdentity(identity: PreviewResetIdentity | undefined): identity is PreviewResetIdentity {
  return Boolean(identity && identity.projectRef === previewProject && identity.schema === previewSchema &&
    identity.branch === candidateBranch && /^[0-9a-f]{40}$/.test(identity.sha) &&
    /^prj_[A-Za-z0-9]+$/.test(identity.vercelProjectId) && /^team_[A-Za-z0-9]+$/.test(identity.vercelTeamId) && /^dpl_[A-Za-z0-9]+$/.test(identity.deploymentId));
}

/** Scoped credentials stay on the Vercel API origin; health requests carry none. */
export async function verifyPreviewResetIdentity(identity: PreviewResetIdentity, token: string | undefined, fetcher: typeof fetch = fetch): Promise<VerifiedPreviewResetIdentity> {
  const fail = (): never => { throw new Error("Isolated Preview identity verification failed. No database connection was opened."); };
  if (!validPreviewIdentity(identity) || !token?.trim()) fail();
  const api = async (pathname: string) => {
    const response = await fetcher(`https://api.vercel.com${pathname}`, { headers: { Authorization: `Bearer ${token}` }, redirect: "error", signal: AbortSignal.timeout(10_000) });
    if (!response.ok) fail();
    return response.json();
  };
  const teamId = encodeURIComponent(identity.vercelTeamId);
  const project = await api(`/v9/projects/${encodeURIComponent(identity.vercelProjectId)}?teamId=${teamId}`);
  const team = await api(`/v2/teams/${teamId}`);
  const deployment = await api(`/v13/deployments/${encodeURIComponent(identity.deploymentId)}?teamId=${teamId}&withGitRepoInfo=true`);
  if (project?.id !== identity.vercelProjectId || project.name !== "newproject" || project.accountId !== identity.vercelTeamId ||
      project.link?.type !== "github" || project.link.org !== "essafariatravel" || project.link.repo !== "newproject" ||
      team?.id !== identity.vercelTeamId || team.slug !== "essafaria-travel-s-projects" ||
      deployment?.id !== identity.deploymentId || deployment.projectId !== identity.vercelProjectId || deployment.ownerId !== identity.vercelTeamId ||
      deployment.readyState !== "READY" || ![null, "preview"].includes(deployment.target) ||
      deployment.gitSource?.sha !== identity.sha || deployment.gitSource?.ref !== identity.branch ||
      (deployment.meta?.githubCommitSha && deployment.meta.githubCommitSha !== identity.sha) ||
      (deployment.meta?.githubCommitRef && deployment.meta.githubCommitRef !== identity.branch) ||
      typeof deployment.url !== "string" || !/^newproject-[a-z0-9-]+\.vercel\.app$/.test(deployment.url)) fail();
  const response = await fetcher(`https://${deployment.url}/api/health`, { redirect: "error", signal: AbortSignal.timeout(10_000) });
  if (!response.ok) fail();
  const health = await response.json();
  if (!health?.ok || health.service !== "essafaria-visa-os" || health.deployment?.environment !== "preview") fail();
  return { ...identity, environment: "preview" };
}

export function parseResetOptions(args: string[]) {
  const options = { blueprint: false, execute: false, isolatedPreview: false, preserveUsers: [] as string[], backupManifest: undefined as string | undefined, approvalManifest: undefined as string | undefined };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (["--force", "--yes", "--confirm"].includes(arg!)) throw new Error("Execution is disabled for unsafe aliases. Supply a reviewed approval manifest and explicit --execute.");
    if (arg === "--execute") { options.execute = true; continue; }
    if (arg === "--dry-run") continue;
    if (arg === "--blueprint") { options.blueprint = true; continue; }
    if (arg === "--isolated-preview") { options.isolatedPreview = true; continue; }
    if (arg === "--preserve-user") {
      const id = args[++index] ?? "";
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error("Invalid preserved user UUID.");
      options.preserveUsers.push(id.toLowerCase()); continue;
    }
    if (arg === "--backup-manifest") { options.backupManifest = args[++index]; if (!options.backupManifest) throw new Error("Unknown reset option: backup manifest path required."); continue; }
    if (arg === "--approval-manifest") { options.approvalManifest = args[++index]; if (!options.approvalManifest || options.approvalManifest.startsWith("--")) throw new Error("Unknown reset option: approval manifest path required."); continue; }
    throw new Error("Unknown reset option. Use --dry-run or --blueprint.");
  }
  options.preserveUsers = [...new Set(options.preserveUsers)];
  if (options.execute && (!options.approvalManifest || options.blueprint || args.includes("--dry-run"))) throw new Error("Execution is disabled without one explicit reviewed approval manifest and an unambiguous --execute request.");
  if (options.isolatedPreview && (!options.approvalManifest || options.blueprint)) throw new Error("Isolated Preview requires a reviewed approval manifest, including for dry-run.");
  return options;
}

export function assertDryRunTarget(env: Record<string, string | undefined>, options?: { isolatedPreview: boolean; previewIdentity: PreviewResetIdentity; gitIdentity: ResetGitIdentity }) {
  const schema = databaseSchema(env);
  if (schema === "visa_os" || env.VERCEL_ENV === "production" || env.NODE_ENV === "production" || env.VERCEL) throw new Error("Production reset planning is forbidden. Use a disposable local snapshot.");
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL must be supplied explicitly for a disposable local snapshot.");
  let url: URL;
  try { url = new URL(env.DATABASE_URL); } catch { throw new Error("Use a local disposable PostgreSQL snapshot."); }
  // pg-connection-string applies query values before URI authority values. Reject
  // effective endpoint/credential overrides and TLS aliases before any connection.
  const sslModes = url.searchParams.getAll("sslmode");
  if ([...url.searchParams.keys()].some((key) => key !== "sslmode") || sslModes.length > 1 ||
      (sslModes.length === 1 && !["disable", "require", "verify-full"].includes(sslModes[0]!))) {
    throw new Error("Reset database URL query parameters are not permitted except one explicit supported sslmode.");
  }
  if (options?.isolatedPreview) {
    const { previewIdentity: identity, gitIdentity: git } = options;
    if (!validPreviewIdentity(identity) || schema !== previewSchema || git.repository !== "essafariatravel/newproject" ||
        git.branch !== candidateBranch || git.sha !== identity.sha || !git.clean ||
        !["postgres:", "postgresql:"].includes(url.protocol) || !targetsSupabaseProject(env.DATABASE_URL, previewProject) ||
        url.pathname !== "/postgres" || url.searchParams.get("sslmode") !== "verify-full" || url.searchParams.getAll("sslmode").length !== 1 || url.searchParams.has("ssl") ||
        env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
      throw new Error("Isolated Preview target, TLS or candidate identity is not verified.");
    }
    return { schema, isolatedPreview: true };
  }
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
  removeOperationalTables: ["legacy_reconciliation_events", "legacy_reconciliation_issues", "session_presence", "sessions", "account_access_tokens", "account_activation_tokens", "account_recovery_requests", "auth_rate_limits", "notifications", "communications", "wallet_topup_requests", "application_price_adjustments", "wallet_transactions", "application_status_history", "document_requests", "documents", "document_blobs", "checklist_items", "applicants", "applications", "agency_registration_followup_tokens", "agency_registration_requests", "agency_registration_history", "agency_registration_documents", "agency_registrations", "users", "agencies"],
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
