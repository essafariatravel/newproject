const DEPLOYMENT_SCHEMAS = {
  preview: "visa_os_preview",
  production: "visa_os",
} as const;

/** Use an isolated schema when sharing a database with another application. */
export function databaseSchema(env: Record<string, string | undefined> = process.env): string {
  const name = env.DATABASE_SCHEMA || "public";
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(name) || name.startsWith("pg_") ||
      ["auth", "storage", "realtime", "vault", "extensions", "information_schema"].includes(name)) {
    throw new Error("DATABASE_SCHEMA must name an application schema using lowercase letters, digits and underscores.");
  }

  // A configured hosted deployment may never cross the Preview/Production
  // schema boundary. When no DB URL exists, builds stay import-safe and query
  // time will fail against the unconfigured DB sentinel instead.
  const hosted = env.VERCEL_ENV === "preview" || env.VERCEL_ENV === "production"
    ? env.VERCEL_ENV
    : null;
  const hasDatabase = Boolean(env.DATABASE_URL || env.MIGRATION_DATABASE_URL);
  if (hosted && hasDatabase && name !== DEPLOYMENT_SCHEMAS[hosted]) {
    throw new Error(`Deployment database schema boundary mismatch: ${hosted} requires ${DEPLOYMENT_SCHEMAS[hosted]}.`);
  }
  return name;
}

export function qualifiedTable(name: string, schema = databaseSchema()): string {
  return `"${schema.replaceAll('"', '""')}"."${name.replaceAll('"', '""')}"`;
}
