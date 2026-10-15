import { targetsSupabaseProject } from "./database-config";
import { ISOLATED_PREVIEW_BRANCH, isolatedPreviewConnection, isolatedPreviewContext } from "./isolated-preview";

type Environment = Record<string, string | undefined>;
const PREVIEW_PROJECT = "prj_0WOxlorbYiljjjBvZ1Cm6M9JmPdp";
const PREVIEW_BRANCH = "codex/preview-mfa-enforcement-2026-10-14";
const SUPABASE_PROJECT = "xgetzgixalrsmuvfthpf";

/** Server-only, evaluated per request. Missing or ambiguous scope enforces MFA. */
export function mfaEnforcementEnabled(env: Environment = process.env): boolean {
  if (env.VERCEL_GIT_COMMIT_REF === ISOLATED_PREVIEW_BRANCH) {
    return env.MFA_ENFORCEMENT_ENABLED !== "false" || !isolatedPreviewContext(env) ||
      !env.DATABASE_URL || !isolatedPreviewConnection(env.DATABASE_URL);
  }
  if (env.MFA_ENFORCEMENT_ENABLED !== "false" || env.VERCEL !== "1" ||
      env.VERCEL_ENV !== "preview" || (env.VERCEL_TARGET_ENV && env.VERCEL_TARGET_ENV !== "preview") ||
      env.VERCEL_PROJECT_ID !== PREVIEW_PROJECT || env.VERCEL_GIT_COMMIT_REF !== PREVIEW_BRANCH ||
      env.DATABASE_SCHEMA !== "visa_os_preview" || !env.DATABASE_URL) return true;
  try {
    const url = new URL(env.DATABASE_URL);
    if (!["postgres:", "postgresql:"].includes(url.protocol) || url.pathname !== "/postgres" ||
        (url.port && !["5432", "6543"].includes(url.port)) || !targetsSupabaseProject(env.DATABASE_URL, SUPABASE_PROJECT)) return true;
    if (url.hostname === `db.${SUPABASE_PROJECT}.supabase.co` && decodeURIComponent(url.username) !== "postgres") return true;
    for (const [name, value] of url.searchParams) {
      // URI parameters must not override routing/search_path or weaken TLS.
      if (["host", "port", "user", "password", "database", "dbname", "options", "uselibpqcompat"].includes(name.toLowerCase())) return true;
      if (name.toLowerCase() === "sslmode" && !["require", "verify-ca", "verify-full"].includes(value)) return true;
      if (name.toLowerCase() === "ssl" && value !== "true") return true;
    }
    return false;
  } catch { return true; } // URL errors can contain secrets; never log them.
}
