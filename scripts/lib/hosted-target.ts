type Environment = Record<string, string | undefined>;
const apiOrigin = "https://api.github.com/repos/essafariatravel/newproject/deployments";
const refusal = "Hosted verification target is not a verified non-Production deployment.";

/** Host shape alone never authorizes a remote probe; require repository-owned Preview evidence. */
export async function verifyHostedTarget(value: string, env: Environment = process.env, fetcher: typeof fetch = fetch): Promise<string> {
  const fail = (): never => { throw new Error(refusal); };
  let url: URL;
  try { url = new URL(value); } catch { return fail(); }
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") fail();
  if (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && url.protocol === "http:") return url.origin;
  // Only immutable deployment names in this project's team namespace qualify for evidence lookup.
  if (url.protocol !== "https:" || url.port || !/^newproject-[a-z0-9]{9}-essafaria-travel-s-projects\.vercel\.app$/.test(url.hostname)) fail();
  const sha = env.PREVIEW_DEPLOYED_SHA || env.GITHUB_SHA;
  if (!sha || !/^[a-f0-9]{40}$/.test(sha) || !env.GH_TOKEN) fail();
  const read = async (endpoint: string) => {
    const response = await fetcher(endpoint, { headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: "application/vnd.github+json" }, redirect: "error", signal: AbortSignal.timeout(10_000) });
    if (!response.ok) fail();
    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) fail();
    return payload as Array<Record<string, unknown>>;
  };
  try {
    const deployments = await read(`${apiOrigin}?sha=${sha}&environment=Preview&per_page=100`);
    for (const deployment of deployments) {
      if (deployment.environment !== "Preview" || deployment.sha !== sha || !Number.isSafeInteger(deployment.id) || Number(deployment.id) <= 0) continue;
      const statuses = await read(`${apiOrigin}/${deployment.id}/statuses`);
      if (statuses.some(status => status.state === "success" && status.environment_url === url.origin)) return url.origin;
    }
  } catch { return fail(); }
  return fail();
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/scripts/lib/hosted-target.ts")) {
  verifyHostedTarget(process.argv[2] ?? "").then(origin => console.log(origin)).catch(() => {
    console.error(refusal); process.exitCode = 2;
  });
}
