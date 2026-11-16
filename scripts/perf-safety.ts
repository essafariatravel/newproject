import { databaseSchema, qualifiedTable } from "../src/lib/database-schema";
import { assertLocalHttpOrigin, assertLocalPerfEnvironment, assertLocalPostgresUrl } from "../perf/local-safety.js";
export { assertLocalPerfEnvironment } from "../perf/local-safety.js";

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

function requireAcknowledgement(env: NodeJS.ProcessEnv): void {
  if (env.PERF_ACK_NONPROD !== "YES") {
    throw new Error("Set PERF_ACK_NONPROD=YES only after confirming the target is an isolated non-Production environment.");
  }
}

export function assertSafePerfTarget(
  env: NodeJS.ProcessEnv = process.env,
  baseUrlValue: string | undefined = env.BASE_URL,
): PerfTarget {
  assertLocalPerfEnvironment(env);
  requireAcknowledgement(env);
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for performance tooling.");
  }

  const schema = databaseSchema(env);
  if (schema === PERF_PRODUCTION_SCHEMA) {
    throw new Error("Performance tooling refuses the Production schema visa_os.");
  }

  let connection: URL;
  try { connection = new URL(assertLocalPostgresUrl(env.DATABASE_URL)); }
  catch { throw new Error("HOSTED_PERF_DISABLED: database URL must use canonical loopback PostgreSQL."); }
  const baseUrl = baseUrlValue ? assertLocalHttpOrigin(baseUrlValue) : null;

  return {
    schema,
    dbHost: connection.hostname,
    dbPort: connection.port || "5432",
    dbName: connection.pathname.slice(1),
    remote: false,
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
