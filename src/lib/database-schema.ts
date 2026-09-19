/** Use an isolated schema when sharing a database with another application. */
export function databaseSchema(env: Record<string, string | undefined> = process.env): string {
  const name = env.DATABASE_SCHEMA || "public";
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(name) || name.startsWith("pg_") ||
      ["auth", "storage", "realtime", "vault", "extensions", "information_schema"].includes(name)) {
    throw new Error("DATABASE_SCHEMA must name an application schema using lowercase letters, digits and underscores.");
  }
  return name;
}

export function qualifiedTable(name: string, schema = databaseSchema()): string {
  return `"${schema.replaceAll('"', '""')}"."${name.replaceAll('"', '""')}"`;
}
