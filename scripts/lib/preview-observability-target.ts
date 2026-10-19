import { databaseSchema } from "../../src/lib/database-schema";
import { databaseUrl, targetsSupabaseProject } from "../../src/lib/database-config";

const PREVIEW_SCHEMA = "visa_os_preview";
const EXPECTED_PROJECT = "xgetzgixalrsmuvfthpf";

/**
 * Refuse accidental use of observability CLIs against Production or an
 * unapproved remote database. This check is read-only and runs before any
 * diagnostics query is issued.
 */
export function assertPreviewObservabilityTarget(
  env: NodeJS.ProcessEnv = process.env,
): { schema: typeof PREVIEW_SCHEMA; databaseHost: string } {
  if (env.VERCEL_ENV && env.VERCEL_ENV !== "preview") {
    throw new Error("Refusing: observability CLI requires Preview environment semantics.");
  }
  if (env.DATABASE_SCHEMA !== PREVIEW_SCHEMA) {
    throw new Error("Refusing: observability CLI only targets visa_os_preview.");
  }

  const previewEnv: NodeJS.ProcessEnv = { ...env, VERCEL_ENV: "preview" };
  if (databaseSchema(previewEnv) !== PREVIEW_SCHEMA) {
    throw new Error("Refusing: observability CLI database schema is not the Preview schema.");
  }
  if (!previewEnv.DATABASE_URL) {
    throw new Error("Refusing: observability CLI requires a configured Preview database URL.");
  }

  const connectionString = databaseUrl(previewEnv);
  if (!targetsSupabaseProject(connectionString, EXPECTED_PROJECT)) {
    throw new Error("Refusing: observability CLI database is not the approved ESSAFARIA Supabase project.");
  }

  // Keep downstream environment checks in the Preview mode already validated
  // above. Do not change a Production environment: that case was rejected.
  env.VERCEL_ENV = "preview";
  return { schema: PREVIEW_SCHEMA, databaseHost: new URL(connectionString).hostname };
}
