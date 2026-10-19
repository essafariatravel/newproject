/**
 * Resolve the exact Vercel production deployment SHA for ESSAFARIA VISA OS.
 *
 * Read-only. Requires VERCEL_TOKEN with access to the ESSAFARIA Vercel team.
 * The token is never accepted on the command line and is never printed.
 */
import { aliasNames, deploymentHasDomain, extractGitSha, newestDeployment, type VercelDeploymentLike } from "./lib/dr-vercel-release";

const DEFAULT_TEAM_ID = "team_KlSuy7Z6To4vppiHgR0KhrLK";
const DEFAULT_PROJECT = "newproject";
const DEFAULT_DOMAIN = "visa.essafariavoyages.com";

function parseArgs(args: string[]) {
  const values: Record<string,string> = {};
  const allowed = new Set(["--team-id","--project","--domain"]);
  for (let i=0;i<args.length;i++) {
    const key=args[i]!;
    if (!allowed.has(key)) throw new Error("Unknown Vercel release resolver option.");
    const value=args[++i];
    if (!value) throw new Error(`${key} requires a value.`);
    values[key]=value;
  }
  return {
    teamId: values["--team-id"] ?? DEFAULT_TEAM_ID,
    project: values["--project"] ?? DEFAULT_PROJECT,
    domain: values["--domain"] ?? DEFAULT_DOMAIN,
  };
}

async function api(pathname: string, token: string): Promise<any> {
  const response = await fetch(`https://api.vercel.com${pathname}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "ESSAFARIA-DR-Release-Resolver/1",
    },
  });
  if (!response.ok) {
    let message = `Vercel API returned HTTP ${response.status}.`;
    try {
      const body = await response.json() as { error?: { code?: string; message?: string } };
      const code = body.error?.code ? ` [${body.error.code}]` : "";
      if (body.error?.message) message = `Vercel API returned HTTP ${response.status}${code}: ${body.error.message}`;
    } catch {
      // Never echo an arbitrary response body.
    }
    throw new Error(message);
  }
  return response.json();
}

async function main() {
  const options=parseArgs(process.argv.slice(2));
  const token=process.env.VERCEL_TOKEN?.trim();
  if (!token) {
    console.error(JSON.stringify({
      status:"REFUSED",
      reason:"VERCEL_TOKEN is required and must have read access to the ESSAFARIA Vercel team.",
      tokenPrinted:false,
    },null,2));
    process.exitCode=2;
    return;
  }

  const project = await api(
    `/v9/projects/${encodeURIComponent(options.project)}?teamId=${encodeURIComponent(options.teamId)}`,
    token,
  );
  const projectId = typeof project?.id === "string" ? project.id : null;
  if (!projectId) throw new Error("Vercel project lookup returned no project ID.");

  const listing = await api(
    `/v7/deployments?projectId=${encodeURIComponent(projectId)}&target=production&state=READY&limit=100&teamId=${encodeURIComponent(options.teamId)}`,
    token,
  );
  const deployments: VercelDeploymentLike[] = Array.isArray(listing?.deployments) ? listing.deployments : [];
  if (!deployments.length) throw new Error("No READY production deployments were returned by Vercel.");

  const matching: VercelDeploymentLike[] = [];
  for (const item of deployments) {
    const id = typeof item.uid === "string" ? item.uid : typeof item.id === "string" ? item.id : null;
    if (!id) continue;
    const detail = await api(
      `/v13/deployments/${encodeURIComponent(id)}?withGitRepoInfo=true&teamId=${encodeURIComponent(options.teamId)}`,
      token,
    ) as VercelDeploymentLike;

    let candidate = detail;
    if (!deploymentHasDomain(candidate, options.domain)) {
      const aliases = await api(
        `/v2/deployments/${encodeURIComponent(id)}/aliases?teamId=${encodeURIComponent(options.teamId)}`,
        token,
      );
      candidate = {
        ...detail,
        aliases: Array.isArray(aliases?.aliases) ? aliases.aliases : [],
      };
    }
    if (deploymentHasDomain(candidate, options.domain)) matching.push(candidate);
  }

  const selected = newestDeployment(matching);
  if (!selected) {
    throw new Error(`No READY production deployment currently owns alias ${options.domain}.`);
  }

  const sha = extractGitSha(selected);
  if (!sha) throw new Error("The matched production deployment does not expose a full 40-character Git SHA.");
  const deploymentId = typeof selected.uid === "string" ? selected.uid : typeof selected.id === "string" ? selected.id : null;
  if (!deploymentId) throw new Error("The matched production deployment has no deployment ID.");

  console.log(JSON.stringify({
    status:"RESOLVED",
    productionDomain:options.domain,
    teamId:options.teamId,
    projectId,
    projectName:options.project,
    deploymentId,
    deploymentUrl:selected.url ?? null,
    gitSha:sha,
    gitBranch:typeof selected.gitSource?.ref === "string" ? selected.gitSource.ref : null,
    target:selected.target ?? "production",
    readyState:selected.readyState ?? selected.state ?? "READY",
    aliases:aliasNames(selected),
    tokenPrinted:false,
    productionModified:false,
  },null,2));
}

main().catch((error)=>{
  console.error(JSON.stringify({
    status:"BLOCKED",
    reason:error instanceof Error ? error.message : "Vercel Production release resolution failed safely.",
    tokenPrinted:false,
    productionModified:false,
  },null,2));
  process.exitCode=1;
});
