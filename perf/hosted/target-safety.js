/** Independent hosted TEST boundary; the existing loopback-only guard is untouched. */
const TEST_BRANCH = "codex/isolated-capacity-test-20261109";
const PROD_VERCEL_PROJECT = "prj_0WOxlorbYiljjjBvZ1Cm6M9JmPdp";
const NON_TEST_DB_REFS = new Set([
  "xgetzgixalrsmuvfthpf", // Production
  "ridoyedqgiavgcwnpubq", // Legacy
  "vwixmkzgpmzgwbshzxji", // Disaster recovery
  "nqudhszgodmzckautrby", // Historical Preview
]);
const TEST_ORIGIN = /^https:\/\/essafaria-visa-os-capacity-test-[a-z0-9-]+\.vercel\.app$/;

function reject() {
  // Avoid including input values: origins and credentials may be sensitive.
  throw new Error("HOSTED_TEST_TARGET_DENIED: requires an exact isolated TEST deployment and database.");
}

/**
 * Fail closed before reading session cookies or starting network traffic.
 * The deployment's project ID/ref must also be verified independently through
 * Vercel/Supabase management APIs immediately before each campaign.
 */
export function assertHostedTestTarget(target) {
  if (!target || typeof target !== "object") reject();
  const {
    baseUrl, approvedOrigin, deploymentProjectId, approvedVercelProjectId,
    supabaseProjectRef, approvedSupabaseRef, gitBranch, vercelEnv, databaseSchema,
  } = target;

  if (typeof baseUrl !== "string" || !TEST_ORIGIN.test(baseUrl) || baseUrl !== approvedOrigin) reject();
  if (typeof deploymentProjectId !== "string" || !/^prj_[a-zA-Z0-9]+$/.test(deploymentProjectId) ||
      deploymentProjectId !== approvedVercelProjectId || deploymentProjectId === PROD_VERCEL_PROJECT) reject();
  if (typeof supabaseProjectRef !== "string" || !/^[a-z]{20}$/.test(supabaseProjectRef) ||
      supabaseProjectRef !== approvedSupabaseRef || NON_TEST_DB_REFS.has(supabaseProjectRef)) reject();
  if (gitBranch !== TEST_BRANCH || vercelEnv !== "preview" || databaseSchema !== "visa_os_preview") reject();
  return baseUrl;
}
