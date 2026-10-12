import { databaseSchema, qualifiedTable } from "../src/lib/database-schema";
import { databaseUrl, targetsSupabaseProject } from "../src/lib/database-config";

export const PERF_EXPECTED_PROJECT = "xgetzgixalrsmuvfthpf";
export const PERF_PREVIEW_SCHEMA = "visa_os_preview";
export const PERF_PRODUCTION_SCHEMA = "visa_os";
export const PERF_PRODUCTION_HOST = "visa.essafariavoyages.com";

export type PerfTarget = {
  schema: string;
  dbHost: string;
  dbPort: string;
  dbName: string;
  remote: boolean;
  baseUrl: string | null;
};

function isLoopback(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function requireAcknowledgement(env: NodeJS.ProcessEnv): void {
  if (env.PERF_ACK_NONPROD !== "YES") {
    throw new Error("Set PERF_ACK_NONPROD=YES only after confirming the target is an isolated non-Production environment.");
  }
}

export function assertSafePerfTarget(
  env: NodeJS.ProcessEnv = process.env,
  baseUrlValue: string | undefined = env.BASE_URL,
): PerfTarget {
  requireAcknowledgement(env);
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for performance tooling.");
  }

  const schema = databaseSchema(env);
  if (schema === PERF_PRODUCTION_SCHEMA) {
    throw new Error("Performance tooling refuses the Production schema visa_os.");
  }

  const connection = new URL(databaseUrl(env));
  const remote = !isLoopback(connection.hostname);

  if (remote) {
    if (schema !== PERF_PREVIEW_SCHEMA) {
      throw new Error("Remote performance tooling is restricted to visa_os_preview.");
    }
    if (!targetsSupabaseProject(env.DATABASE_URL, PERF_EXPECTED_PROJECT)) {
      throw new Error("Remote database does not target the recorded ESSAFARIA Supabase project.");
    }
  }

  let baseUrl: string | null = null;
  if (baseUrlValue) {
    const parsed = new URL(baseUrlValue);
    if (parsed.hostname.toLowerCase() === PERF_PRODUCTION_HOST) {
      throw new Error("Performance tooling refuses the Production hostname.");
    }
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("BASE_URL must use HTTP or HTTPS.");
    }
    baseUrl = parsed.origin;
  }

  return {
    schema,
    dbHost: connection.hostname,
    dbPort: connection.port || "5432",
    dbName: connection.pathname.slice(1),
    remote,
    baseUrl,
  };
}

export function perfTable(name: string, env: NodeJS.ProcessEnv = process.env): string {
  return qualifiedTable(name, databaseSchema(env));
}

export function safeTargetSummary(target: PerfTarget) {
  return {
    schema: target.schema,
    dbHost: target.dbHost,
    dbPort: target.dbPort,
    dbName: target.dbName,
    remote: target.remote,
    baseUrl: target.baseUrl,
    expectedProject: target.remote ? PERF_EXPECTED_PROJECT : null,
  };
}
