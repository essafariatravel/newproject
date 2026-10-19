type Environment = Record<string, string | undefined>;

export const ISOLATED_PREVIEW_BRANCH = "codex/isolated-clean-preview-2026-10-15";
export const ISOLATED_RC_PREVIEW_BRANCH = "codex/master-go-live-rc-2026-10-17";
export const ISOLATED_SUPABASE_PROJECT = "nqudhszgodmzckautrby";
const VERCEL_PROJECT = "prj_0WOxlorbYiljjjBvZ1Cm6M9JmPdp";

/** Exact prepared branches only; this does not authorize a deployment. */
export function isIsolatedPreviewBranch(branch:string|undefined):boolean {
  return branch===ISOLATED_PREVIEW_BRANCH||branch===ISOLATED_RC_PREVIEW_BRANCH;
}

export function targetsIsolatedPreview(value: string): boolean {
  try {
    const url = new URL(value),hosts = [url.hostname],users = [url.username];
    // pg also accepts routing parameters. Detect every candidate conservatively;
    // the strict connection validator then rejects overrides altogether.
    for (const [name, value] of url.searchParams) {
      if (name.toLowerCase() === "host") hosts.push(value);
      if (name.toLowerCase() === "user") users.push(value);
    }
    const normalize = (s: string): string => {
      try { return decodeURIComponent(s).toLowerCase().replace(/\.$/, ""); }
      catch { return s.toLowerCase().replace(/\.$/, ""); }
    };
    const normalizedHosts = hosts.map(normalize);
    return normalizedHosts.includes(`db.${ISOLATED_SUPABASE_PROJECT}.supabase.co`) ||
      (normalizedHosts.some(h => h.endsWith(".pooler.supabase.com")) &&
       users.some(u => normalize(u).endsWith(`.${ISOLATED_SUPABASE_PROJECT}`)));
  } catch { return false; }
}

/** Server-side deployment metadata; never inferred from a browser host or cookie. */
export function isolatedPreviewContext(env: Environment): boolean {
  return env.VERCEL === "1" && env.VERCEL_ENV === "preview" &&
    (!env.VERCEL_TARGET_ENV || env.VERCEL_TARGET_ENV === "preview") &&
    env.VERCEL_PROJECT_ID === VERCEL_PROJECT &&
    isIsolatedPreviewBranch(env.VERCEL_GIT_COMMIT_REF) &&
    env.DATABASE_SCHEMA === "visa_os_preview";
}

/** Exact new project and role, with no routing override or weakened TLS. */
export function isolatedPreviewConnection(value: string): boolean {
  try {
    const url = new URL(value);
    if (!["postgres:", "postgresql:"].includes(url.protocol) || url.pathname !== "/postgres" ||
        (url.port && !["5432", "6543"].includes(url.port))) return false;
    const user = decodeURIComponent(url.username);
    if (!((url.hostname === `db.${ISOLATED_SUPABASE_PROJECT}.supabase.co` && user === "postgres") ||
          (url.hostname === "aws-0-us-east-1.pooler.supabase.com" && user === `postgres.${ISOLATED_SUPABASE_PROJECT}`))) return false;
    for (const [name, value] of url.searchParams) {
      if (["host", "port", "user", "password", "database", "dbname", "options", "uselibpqcompat"].includes(name.toLowerCase())) return false;
      if (name.toLowerCase() === "sslmode" && value !== "verify-full") return false;
      if (name.toLowerCase() === "ssl" && value !== "true") return false;
    }
    return true;
  } catch { return false; }
}
