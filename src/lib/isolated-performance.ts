type Environment = Record<string, string | undefined>;

/** These literal IDs are TEST-only. Never infer permission from a caller-supplied URL. */
export const ISOLATED_PERFORMANCE_BRANCH = "codex/isolated-capacity-test-20261109";
export const ISOLATED_PERFORMANCE_SUPABASE_REF = "catvumvhpvsujopcvxxy";
export const ISOLATED_PERFORMANCE_VERCEL_PROJECT = "prj_g0JhQm6sgMOyOTXLWNHI8GYy3VYo";
const TEST_ROLE = "capacity_runner_20261109";
const TEST_POOLER = "aws-0-us-east-1.pooler.supabase.com";

export function isIsolatedPerformanceBranch(branch: string | undefined): boolean {
  return branch === ISOLATED_PERFORMANCE_BRANCH;
}

export function isolatedPerformanceContext(env: Environment): boolean {
  return env.VERCEL === "1" && env.VERCEL_ENV === "preview" &&
    (!env.VERCEL_TARGET_ENV || env.VERCEL_TARGET_ENV === "preview") &&
    env.VERCEL_PROJECT_ID === ISOLATED_PERFORMANCE_VERCEL_PROJECT &&
    env.VERCEL_GIT_COMMIT_REF === ISOLATED_PERFORMANCE_BRANCH &&
    env.DATABASE_SCHEMA === "visa_os_preview";
}

/** Detect any attempt to target TEST even when the caller is outside TEST. */
export function targetsIsolatedPerformance(value: string): boolean {
  try {
    const url = new URL(value);
    const hosts = [url.hostname];
    const users = [url.username];
    for (const [name, param] of url.searchParams) {
      if (name.toLowerCase() === "host") hosts.push(param);
      if (name.toLowerCase() === "user") users.push(param);
    }
    return hosts.some((host) => decodeURIComponent(host).toLowerCase().replace(/\.$/, "") ===
        `db.${ISOLATED_PERFORMANCE_SUPABASE_REF}.supabase.co`) ||
      (hosts.some((host) => host.toLowerCase().endsWith(".pooler.supabase.com")) &&
        users.some((user) => decodeURIComponent(user).toLowerCase().endsWith(`.${ISOLATED_PERFORMANCE_SUPABASE_REF}`)));
  } catch { return false; }
}

/** An unambiguous TEST-only DB role, approved pooler and certificate-checked TLS. */
export function isolatedPerformanceConnection(value: string): boolean {
  try {
    const url = new URL(value);
    if (!["postgres:", "postgresql:"].includes(url.protocol) || url.hostname !== TEST_POOLER ||
        url.pathname !== "/postgres" || url.port !== "5432" || !url.password ||
        decodeURIComponent(url.username) !== `${TEST_ROLE}.${ISOLATED_PERFORMANCE_SUPABASE_REF}`) return false;
    if (url.searchParams.get("sslmode") !== "verify-full") return false;
    for (const [name] of url.searchParams) {
      if (name.toLowerCase() !== "sslmode") return false;
    }
    return true;
  } catch { return false; }
}
