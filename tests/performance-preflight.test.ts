import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import * as safety from "../scripts/perf-safety";

const source = readFileSync(new URL("../scripts/perf-preflight.ts", import.meta.url), "utf8");
const executable = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText.replace("main().catch(", "return main().catch(");

async function runPreflight(health: unknown, overrides: Partial<NodeJS.ProcessEnv> = {}, httpStatus = 200) {
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: "test", PERF_ACK_NONPROD: "YES", DATABASE_SCHEMA: "visa_os_preview",
    DATABASE_URL: `postgresql://postgres.${safety.PERF_EXPECTED_PROJECT}:synthetic-password@aws-1-us-east-1.pooler.supabase.com:6543/postgres`,
    BASE_URL: "https://preview.example.test", ...overrides,
  };
  let output = "";
  let error = "";
  let exitCode = 0;
  let fetches = 0;
  let connections = 0;
  class Pool {
    async connect() {
      connections++;
      return { query: async () => ({ rows: [], rowCount: 0 }), release() {} };
    }
    async end() {}
  }
  const requireDouble = (name: string) => {
    if (name === "./lib/load-env") return {};
    if (name === "pg") return { Pool };
    if (name === "../src/lib/database-config") return { databasePoolConfig: () => ({}) };
    if (name === "./perf-safety") return {
      ...safety, assertSafePerfTarget: () => safety.assertSafePerfTarget(env),
      perfTable: (name: string) => safety.perfTable(name, env),
    };
    throw new Error("Unexpected preflight dependency");
  };
  await new Function("require", "exports", "process", "fetch", "console", executable)(
    requireDouble, {}, { env, exit: (code: number) => { exitCode = code; } },
    async () => { fetches++; return new Response(JSON.stringify(health), { status: httpStatus }); },
    { log: (value: string) => { output += value; }, error: (value: string) => { error += value; } },
  );
  return { output, error, exitCode, fetches, connections };
}

describe("Performance preflight public health contract", () => {
  it("accepts minimal healthy service status without public deployment metadata", async () => {
    const result = await runPreflight({ status: "healthy", service: "essafaria-visa-os" });
    expect(result.error).toBe("");
    expect(result.exitCode).toBe(0);
    expect(result.connections).toBe(1);
    expect(JSON.parse(result.output)).toMatchObject({ ok: true, health: { status: 200 } });
    expect(Object.keys(JSON.parse(result.output).health)).toEqual(["status"]);
  });

  it.each([
    { status: "degraded", service: "essafaria-visa-os" },
    { status: "healthy", service: "other-service" },
    { ok: true, deployment: { environment: "preview" } },
    null,
  ])("rejects unready or incorrect public health payload %#", async (health) => {
    const result = await runPreflight(health);
    expect(result.exitCode).toBe(1);
    expect(result.connections).toBe(0);
    expect(result.output).toBe("");
  });

  it("rejects HTTP 503 even with a healthy payload", async () => {
    const result = await runPreflight({ status: "healthy", service: "essafaria-visa-os" }, {}, 503);
    expect(result.error).toContain("HTTP 503");
    expect(result.connections).toBe(0);
  });

  it.each([
    { PERF_ACK_NONPROD: undefined },
    { DATABASE_SCHEMA: "visa_os" },
    { DATABASE_SCHEMA: "unapproved_remote" },
    { BASE_URL: "https://visa.essafariavoyages.com" },
    { DATABASE_URL: "postgresql://postgres.wrongproject:synthetic-password@aws-1-us-east-1.pooler.supabase.com:6543/postgres" },
  ])("preserves non-Production guard before HTTP or database access %#", async (overrides) => {
    const result = await runPreflight({ status: "healthy", service: "essafaria-visa-os" }, overrides);
    expect(result.exitCode).toBe(1);
    expect(result.fetches).toBe(0);
    expect(result.connections).toBe(0);
  });
});
