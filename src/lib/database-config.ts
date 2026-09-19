import type { PoolConfig } from "pg";

type Environment = Record<string, string | undefined>;
const LOCAL_DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/essafaria";

/** Shared by the server and CLI tools. Never import into a client component. */
export function databaseUrl(env: Environment = process.env, migration = false): string {
  const value = (migration ? env.MIGRATION_DATABASE_URL : undefined) || env.DATABASE_URL;
  if (!value) {
    if (env.NODE_ENV === "production" || env.VERCEL) {
      throw new Error("DATABASE_URL is required for deployed environments.");
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
  return {
    connectionString: databaseUrl(env, migration),
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
