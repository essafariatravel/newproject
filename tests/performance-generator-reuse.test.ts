import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import * as schema from "../src/db/schema";
import * as policy from "../perf/local-safety.js";
import { assertSafePerfTarget } from "../scripts/perf-safety";

const files = ["perf-seed-identities.ts", "perf-seed-scale.ts"] as const;
const source = (file: string) => {
  const path = resolve("scripts", file);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
};
const compile = (input: string) => ts.transpileModule(input, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const bootstrap = compile(readFileSync(resolve("scripts/lib/perf-local-env.ts"), "utf8"));
const valid = {
  NODE_ENV: "test" as const,
  PERF_ACK_NONPROD: "YES", DATABASE_SCHEMA: "perf_local",
  DATABASE_URL: "postgresql://synthetic:unused@127.0.0.1:5432/local",
  BASE_URL: "http://127.0.0.1:3000",
};

function scaleInitialization(overrides: Record<string, string | undefined>) {
  const env = { ...valid, PERF_DATASET_ID: "synthetic-a", ...overrides };
  const acquiredPools: unknown[] = [];
  const text = source("perf-seed-scale.ts");
  const parsed = ts.createSourceFile("perf-seed-scale.ts", text, ts.ScriptTarget.ES2022, true);
  const entrypoint = parsed.statements.at(-1);
  if (!entrypoint || !ts.isExpressionStatement(entrypoint)) throw new Error("Generator main entrypoint is missing");
  // Extract main without running the seed's CLI catch handler. Every external
  // dependency is inert; the Pool constructor is an explicit pre-I/O boundary.
  const input = text.slice(0, entrypoint.getStart(parsed)) + "\nreturn main;";
  const requireDouble = (name: string) => {
    if (name === "./lib/perf-local-env") return policy.assertLocalPerfEnvironment(env);
    if (name === "pg") return { Pool: class {
      constructor(config: unknown) { acquiredPools.push(config); throw new Error("POOL_BOUNDARY"); }
    } };
    if (name === "../src/lib/database-config") return { databasePoolConfig: () => ({}) };
    if (name === "./perf-safety") return { assertSafePerfTarget: () => assertSafePerfTarget(env) };
    throw new Error(`Unexpected dependency ${name}`);
  };
  const main = new Function("require", "exports", "process", compile(input))(requireDouble, {}, { env }) as () => Promise<void>;
  return { main, acquiredPools };
}

describe.each(files)("reused generator initialization without I/O: %s", (file) => {
  // A missing bootstrap or a dependency moved above it must fail before even
  // acquiring pg, crypto, fs, dotenv, or configuration dependencies.
  it.each([
    { DATABASE_URL: "postgresql://synthetic:unused@cloud.test:5432/local" },
    { DATABASE_URL: "postgresql://synthetic:unused@localhost:5432/local?hostaddr=203.0.113.1" },
    { BASE_URL: "https://preview.example.test" },
    { VERCEL_ENV: "preview" }, { SUPABASE_SERVICE_ROLE_KEY: "synthetic-unused" },
    { AWS_PROFILE: "synthetic-unused" }, { PGHOST: "cloud.test" },
    { HTTPS_PROXY: "https://proxy.test" }, { NODE_OPTIONS: "--require=unused" },
    { K6_OUT: "cloud" }, { K6_OTEL_EXPORTER_OTLP_ENDPOINT: "https://collector.test" },
    { MFA_ENCRYPTION_KEY: "synthetic-unused" },
  ])("rejects unsafe inputs before dependency acquisition: %j", (overrides) => {
    const acquired: string[] = [];
    const env = {
      ...valid, PERF_ALLOW_REMOTE_BULK: "YES", PERF_ALLOW_LARGE_REMOTE_BULK: "YES", ...overrides,
    };
    const requireDouble = (name: string) => {
      if (name === "./lib/perf-local-env") {
        return new Function("require", "exports", "process", bootstrap)(() => policy, {}, { env });
      }
      acquired.push(name);
      throw new Error("Dependency acquired before local policy");
    };
    expect(() => new Function("require", "exports", "process", compile(source(file)))(
      requireDouble, {}, { env },
    )).toThrow(/HOSTED_PERF_DISABLED/);
    expect(acquired).toEqual([]);
  });

  it("limits synthetic writes to declared fixture tables without sessions, migrations or destructive operations", () => {
    const text = source(file);
    expect(text).not.toBe("");
    const allowed = file === "perf-seed-identities.ts"
      ? ["agencies", "users"]
      : ["agencies", "users", "applications", "applicants", "checklist_items", "documents", "notifications", "communications", "audit_logs", "application_status_history", "wallet_transactions"];
    const writes = [...text.matchAll(/\b(?:insert\s+into|update)\s+\$\{perfTable\((["'])([a-z_]+)\1\)\}/gi)];
    expect(writes.length).toBeGreaterThan(0);
    for (const write of writes) expect(allowed).toContain(write[2]);
    expect(text).not.toMatch(/\b(?:delete\s+from|truncate|alter\s+table|disable\s+trigger|set\s+session_replication_role)\b/i);
    expect(text).not.toMatch(/mfa_verified_at|mfa_credentials|mfa_enrollment_authorizations|\.\/lib\/load-env|PERF_ALLOW_(?:LARGE_)?REMOTE_BULK/);
  });

  it("uses current business columns and supplies every required insert value", () => {
    const tables = [schema.agencies, schema.users, schema.applications, schema.applicants,
      schema.checklistItems, schema.documents, schema.notifications, schema.communications,
      schema.auditLogs, schema.applicationStatusHistory, schema.walletTransactions];
    const configs = new Map(tables.map(table => { const config = getTableConfig(table); return [config.name, config]; }));
    const inserts = [...source(file).matchAll(/insert\s+into\s+\$\{perfTable\((["'])([a-z_]+)\1\)\}\s*\(([^)]+)\)/gi)];
    expect(inserts.length).toBeGreaterThan(0);
    for (const insert of inserts) {
      const table = configs.get(insert[2]!);
      expect(table, insert[2]).toBeDefined();
      const columns = insert[3]!.split(",").map(column => column.trim());
      for (const column of columns) expect(table!.columns.map(value => value.name)).toContain(column);
      for (const column of table!.columns.filter(value => value.notNull && !value.hasDefault)) {
        expect(columns, `${insert[2]}.${column.name}`).toContain(column.name);
      }
    }
  });
});

describe("synthetic volume fixture semantics", () => {
  it('rejects invalid cohort metadata settings before acquiring the password hashing dependency',async()=>{
    const run=scaleInitialization({PERF_AGENCY_IDENTITIES:'2',PERF_SYNTHETIC_PASSWORD:'synthetic-local-only-password',PERF_DOCS_PER_APP:'1'});
    await expect(run.main()).rejects.toThrow('PERF_QUERY_ONLY_DOCUMENT_METADATA');
    expect(run.acquiredPools).toEqual([]);
  });
  it("defaults to zero document references and stops at the mocked pool boundary", async () => {
    const run = scaleInitialization({});
    await expect(run.main()).rejects.toThrow("POOL_BOUNDARY");
    expect(run.acquiredPools).toHaveLength(1);
  });

  it.each([
    { PERF_DOCS_PER_APP: "1" },
    { PERF_DOCS_PER_APP: "1", PERF_QUERY_ONLY_DOCUMENT_METADATA: "NO" },
  ])("refuses absent-file metadata without explicit query-only opt-in: %j", async (overrides) => {
    const run = scaleInitialization(overrides);
    await expect(run.main()).rejects.toThrow(/PERF_QUERY_ONLY_DOCUMENT_METADATA/);
    expect(run.acquiredPools).toEqual([]);
  });

  it.each([
    { PERF_DATASET_ID: "../unsafe" }, { PERF_APPLICATIONS: "0" },
    { PERF_APPLICATIONS: "100001" }, { PERF_AGENCIES: "1" },
    { PERF_DOCS_PER_APP: "11" }, { PERF_NOTIFICATIONS_PER_APP: "11" },
    { PERF_MESSAGES_PER_APP: "6" }, { PERF_AUDITS_PER_APP: "11" },
    { PERF_LEDGER_ROWS: "200001" }, { PERF_BATCH_SIZE: "99" },
    { DATABASE_SCHEMA: "visa_os" }, { PERF_ACK_NONPROD: "NO" },
  ])("rejects invalid size or safety inputs before acquiring a pool: %j", async (overrides) => {
    const run = scaleInitialization(overrides);
    await expect(run.main()).rejects.toThrow(/PERF_|Production schema/);
    expect(run.acquiredPools).toEqual([]);
  });

  it("allows explicitly query-only metadata initialization without connecting", async () => {
    const run = scaleInitialization({ PERF_DOCS_PER_APP: "1", PERF_QUERY_ONLY_DOCUMENT_METADATA: "YES" });
    await expect(run.main()).rejects.toThrow("POOL_BOUNDARY");
    expect(run.acquiredPools).toHaveLength(1);
  });

  it("leaves draft submission and rule provenance to their real workflows", () => {
    const text = source("perf-seed-scale.ts");
    expect(text).toMatch(/where active and is_draft and not is_terminal/);
    const applicationInsert = text.match(/insert into \$\{perfTable\("applications"\)\}\s*\(([^)]+)\)/i);
    expect(applicationInsert).not.toBeNull();
    expect(applicationInsert![1]).not.toMatch(/submitted_at|submitted_price|submitted_currency|effective_price|visa_rule_snapshot|decision_at|completed_at/);
    expect(text).not.toMatch(/'ACCEPTED'|'APPROVED'|'REJECTED'|reviewed_by|reviewed_at/);
    expect(text).toContain("'UPLOADED'");
    expect(text).toContain("'PERF_SYNTHETIC_EVENT'");
  });
});
