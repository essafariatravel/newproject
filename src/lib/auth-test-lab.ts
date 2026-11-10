type Environment = Record<string, string | undefined>;

const BRANCH = "codex/auth-bot-lockout-20261110";
const PROJECT_REF = "zdmzcomcztchocdxxjhf";
const VERCEL_PROJECT = "prj_0WOxlorbYiljjjBvZ1Cm6M9JmPdp";
const DISABLED = "essafaria-preview-disabled";
const inherited = /^(?:newpro_|NEXT_PUBLIC_newpro_|POSTGRES_|(?:NEXT_PUBLIC_)?SUPABASE_)|^(?:SESSION_SECRET|SEED_ADMIN_PASSWORD|SEED_AGENCY_PASSWORD|BREVO_API_KEY|DIRECT_DATABASE_URL)$/i;
const driverOverride = /^PG[A-Z_]/i;

function refuse(reason: string): never {
  throw new Error(`Authentication Preview database project boundary mismatch (${reason}).`);
}

function refersToLab(value: string | undefined): boolean {
  if (!value) return false;
  if (value.toLowerCase().includes(PROJECT_REF)) return true;
  try { return decodeURIComponent(value).toLowerCase().includes(PROJECT_REF); }
  catch { return false; }
}

export function usesAuthTestLab(env: Environment): boolean {
  return env.VERCEL_GIT_COMMIT_REF === BRANCH ||
    refersToLab(env.DATABASE_URL) || refersToLab(env.MIGRATION_DATABASE_URL);
}

function hasUnsafeInheritedCredentials(env: Environment): boolean {
  return Object.entries(env).some(([name, value]) =>
    value && (driverOverride.test(name) || (inherited.test(name) && value !== DISABLED)));
}

export function authTestLabUrl(env: Environment, migration = false): string {
  if (env.VERCEL !== "1" || env.VERCEL_ENV !== "preview" ||
      env.VERCEL_TARGET_ENV !== "preview" || env.VERCEL_PROJECT_ID !== VERCEL_PROJECT ||
      env.VERCEL_GIT_COMMIT_REF !== BRANCH || env.DATABASE_SCHEMA !== "visa_os_preview") {
    refuse("context");
  }
  if (migration || env.MIGRATION_DATABASE_URL || env.ESSAFARIA_READONLY_BUILD !== "true" ||
      env.ALLOW_DEMO_SEED !== "false" || env.PREVIEW_ADMIN_BOOTSTRAP !== "false" ||
      env.STORAGE_PROVIDER !== "db" || env.STORAGE_OPERATIONS_ENABLED !== "false" ||
      env.TRANSACTIONAL_EMAIL_PROVIDER !== "disabled" || env.MFA_ENFORCEMENT_ENABLED !== "true") {
    refuse("unsafe configuration");
  }
  if (hasUnsafeInheritedCredentials(env)) {
    refuse("inherited credentials");
  }
  const value = env.DATABASE_URL;
  if (!value) return refuse("connection");
  try {
    const uri = new URL(value);
    // The shared Supabase pooler routes by role.project-ref. Require the
    // lab tenant and the dedicated runtime role, with verified TLS from pg.
    if (["postgres:", "postgresql:"].includes(uri.protocol) &&
        /^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(uri.hostname) &&
        uri.port === "6543" && uri.pathname === "/postgres" &&
        decodeURIComponent(uri.username) === `essafaria_preview_app.${PROJECT_REF}` &&
        decodeURIComponent(uri.password) && !uri.search && !uri.hash) return value;
  } catch {
    // Keep malformed connection strings and credentials out of the error.
  }
  return refuse("connection");
}

function isLoopback(value: string | undefined): boolean {
  if (!value) return true;
  try {
    const uri = new URL(value);
    return ["postgres:", "postgresql:"].includes(uri.protocol) &&
      ["localhost", "127.0.0.1", "[::1]"].includes(uri.hostname) && !uri.search && !uri.hash;
  } catch { return false; }
}

/** Entry-point guard for this Preview-only build and application runtime. */
export function assertAuthPreviewArtifact(env: Environment = process.env): void {
  const hosted = env.VERCEL || env.VERCEL_ENV || env.VERCEL_TARGET_ENV ||
    env.VERCEL_PROJECT_ID || env.VERCEL_GIT_COMMIT_REF;
  if (!hosted && isLoopback(env.DATABASE_URL) && isLoopback(env.MIGRATION_DATABASE_URL) &&
      !hasUnsafeInheritedCredentials(env)) return;
  authTestLabUrl(env);
}
