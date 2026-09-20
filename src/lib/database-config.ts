import type { PoolConfig } from "pg";
import { rootCertificates } from "node:tls";
import { SUPABASE_CA } from "./supabase-ca";

type Environment = Record<string, string | undefined>;
const LOCAL_DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/essafaria";
// Used only when a deployed environment has no DATABASE_URL: nothing listens on
// 127.0.0.1:1, so the first query fails immediately (ECONNREFUSED) instead of
// hanging on a 10s connection timeout, and every handler already maps database
// failures to a safe "Service temporarily unavailable" message.
const UNCONFIGURED_DATABASE_URL = "postgresql://127.0.0.1:1/essafaria";

/** Shared by the server and CLI tools. Never import into a client component. */
export function databaseUrl(env: Environment = process.env, migration = false): string {
  const value = (migration ? env.MIGRATION_DATABASE_URL : undefined) || env.DATABASE_URL;
  if (!value) {
    if (env.NODE_ENV === "production" || env.VERCEL) {
      // Never throw here. `next build` imports every route module while
      // collecting page data, and VERCEL=1 is set during builds: throwing at
      // import time fails the whole Vercel build whenever DATABASE_URL is not
      // available to that branch's Preview (e.g. branch-scoped variables).
      // Log the misconfiguration once per process and defer the failure to
      // query time, where it is already handled safely.
      console.error(
        "[database] DATABASE_URL is not configured for this deployment; database queries will fail. " +
          "Vercel: Settings → Environment Variables → DATABASE_URL → make sure the Preview environment " +
          "covers this branch (no branch filter), then redeploy.",
      );
      return UNCONFIGURED_DATABASE_URL;
    }
    return LOCAL_DATABASE_URL;
  }
  try {
    const url = new URL(value);
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || !url.pathname.slice(1)) {
      throw new Error();
    }
  } catch {
    // Do not include the input: URL parsing errors can contain the password.
    throw new Error("Database configuration must be a PostgreSQL connection URI.");
  }
  return value;
}

export function databasePoolConfig(env: Environment = process.env, migration = false): PoolConfig {
  const connectionString = databaseUrl(env, migration);
  const url = new URL(connectionString);
  const supabase = url.hostname.endsWith(".pooler.supabase.com") || url.hostname.endsWith(".supabase.co");
  return {
    connectionString,
    // Supabase enforces TLS even when a manually copied URI omits sslmode.
    // Keep certificate verification enabled; never fall back to plaintext.
    ...(supabase && !url.searchParams.has("sslmode") && !url.searchParams.has("ssl")
      ? { ssl: { rejectUnauthorized: true, ca: [...rootCertificates, SUPABASE_CA] } } : {}),
    // Each Vercel function instance owns a pool; keep per-instance usage small.
    max: migration ? 1 : env.VERCEL ? 3 : 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: true,
  };
}

/** A routing check, not a substitute for successfully querying the database. */
export function targetsSupabaseProject(value: string, reference: string): boolean {
  const url = new URL(value);
  return url.hostname === `db.${reference}.supabase.co` ||
    (url.hostname.endsWith(".pooler.supabase.com") &&
      decodeURIComponent(url.username) === `postgres.${reference}`);
}
