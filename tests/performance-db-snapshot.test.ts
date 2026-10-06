import { readFileSync } from "node:fs";
import * as path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import * as safety from "../scripts/perf-safety";

const source = readFileSync(new URL("../scripts/perf-db-snapshot.ts", import.meta.url), "utf8");
const executable = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText.replace("main().catch(", "return main().catch(");

async function runSnapshot(options: {
  installed?: boolean;
  failure?: string;
  env?: Partial<NodeJS.ProcessEnv>;
} = {}) {
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: "test", PERF_ACK_NONPROD: "YES", DATABASE_SCHEMA: "visa_os_preview",
    DATABASE_URL: `postgresql://postgres.${safety.PERF_EXPECTED_PROJECT}:synthetic-password@aws-1-us-east-1.pooler.supabase.com:6543/postgres`,
    BASE_URL: "https://preview.example.test", ...options.env,
  };
  const queries: Array<{ sql: string; values?: unknown[] }> = [];
  const files: Array<{ body: string; mode: number }> = [];
  let error = "";
  let exitCode = 0;
  let connections = 0;
  let released = false;
  let ended = false;
  class Pool {
    async connect() {
      connections++;
      return {
        query: async (sql: string, values?: unknown[]) => {
          queries.push({ sql, values });
          if (sql.includes("pg_extension")) return { rows: options.installed === false ? [] : [{ present: true, namespace: 'synthetic"extension' }] };
          if (sql.includes("pg_stat_statements")) {
            if (options.failure || !sql.includes('from "synthetic""extension"."pg_stat_statements"')) {
              throw new Error(options.failure ?? "42P01");
            }
            return { rows: [{ calls: 2, mean_exec_ms: 1 }] };
          }
          return { rows: [] };
        },
        release: () => { released = true; },
      };
    }
    async end() { ended = true; }
  }
  const requireDouble = (name: string) => {
    if (name === "./lib/load-env") return {};
    if (name === "node:path") return path;
    if (name === "node:fs/promises") return {
      mkdir: async () => {},
      writeFile: async (_file: string, body: string, options: { mode: number }) => { files.push({ body, mode: options.mode }); },
    };
    if (name === "pg") return { Pool };
    if (name === "../src/lib/database-config") return { databasePoolConfig: () => ({}) };
    if (name === "./perf-safety") return { ...safety, assertSafePerfTarget: () => safety.assertSafePerfTarget(env) };
    throw new Error("Unexpected snapshot dependency");
  };
  await new Function("require", "exports", "process", "console", executable)(
    requireDouble, {}, { env, exit: (code: number) => { exitCode = code; } },
    { log: () => {}, error: (value: string) => { error += value; } },
  );
  return { queries, files, error, exitCode, connections, released, ended };
}

describe("Performance database snapshot namespace resolution", () => {
  it("resolves and quotes the extension namespace without changing read-only query filters", async () => {
    const result = await runSnapshot();
    expect(result.exitCode).toBe(0);
    expect(result.error).toBe("");
    const statementQuery = result.queries.find(({ sql }) => sql.includes('from "synthetic""extension"."pg_stat_statements"'));
    expect(statementQuery?.values).toEqual(["%visa_os_preview%"]);
    expect(result.queries.every(({ sql }) => /^\s*select\b/i.test(sql))).toBe(true);
    expect(JSON.parse(result.files[0].body).pgStatStatements).toEqual([{ calls: 2, mean_exec_ms: 1 }]);
    expect(result.files[0].mode).toBe(0o600);
    expect(result.released && result.ended).toBe(true);
  });

  it("preserves empty statement metrics when the extension is absent", async () => {
    const result = await runSnapshot({ installed: false });
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.files[0].body).pgStatStatements).toEqual([]);
  });

  it.each(["42P01", "42501"])("fails closed on a genuine statistics query failure %s", async (failure) => {
    const result = await runSnapshot({ failure });
    expect(result.exitCode).toBe(1);
    expect(result.error).toBe(failure);
    expect(result.files).toEqual([]);
    expect(result.released && result.ended).toBe(true);
  });

  it.each([
    { PERF_ACK_NONPROD: undefined },
    { DATABASE_SCHEMA: "visa_os" },
    { DATABASE_SCHEMA: "unapproved_remote" },
    { BASE_URL: "https://visa.essafariavoyages.com" },
    { DATABASE_URL: "postgresql://postgres.wrongproject:synthetic-password@aws-1-us-east-1.pooler.supabase.com:6543/postgres" },
  ])("preserves performance safety before connecting or writing files %#", async (env) => {
    const result = await runSnapshot({ env });
    expect(result.exitCode).toBe(1);
    expect(result.connections).toBe(0);
    expect(result.queries).toEqual([]);
    expect(result.files).toEqual([]);
  });
});
