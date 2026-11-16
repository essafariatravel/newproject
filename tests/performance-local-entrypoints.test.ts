import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import * as policy from "../perf/local-safety.js";

const compile = (file: string) => ts.transpileModule(readFileSync(resolve(file), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const bootstrap = compile("scripts/lib/perf-local-env.ts");
const scripts = readdirSync(resolve("scripts")).filter(name => /^perf-.*\.ts$/.test(name) && name !== "perf-safety.ts");
const valid = { PERF_ACK_NONPROD: "YES", DATABASE_URL: "postgresql://u:synthetic@127.0.0.1:5432/local", BASE_URL: "http://127.0.0.1:3000", DATABASE_SCHEMA: "visa_os_preview" };

describe("performance entrypoint isolation before environment/session/evidence reads", () => {
  it.each(scripts)("rejects cloud credentials before dependency acquisition in %s", (script) => {
    const acquired: string[] = [];
    const env = { ...valid, AWS_ACCESS_KEY_ID: "synthetic-unused" };
    const requireDouble = (name: string) => {
      if (name === "./lib/perf-local-env") {
        return new Function("require", "exports", "process", bootstrap)(
          () => policy, {}, { env },
        );
      }
      acquired.push(name);
      throw new Error("dependency acquired before local policy");
    };
    expect(() => new Function("require", "exports", "process", compile(`scripts/${script}`))(requireDouble, {}, { env })).toThrow(/HOSTED_PERF_DISABLED/);
    expect(acquired).toEqual([]);
  });
});

describe.each(["perf/k6/essafaria-load.js", "perf/k6/essafaria-exports.js"])("direct k6 local-only initialization: %s", (file) => {
  function initialize(overrides: Record<string, string | undefined>) {
    const opened: string[] = [];
    const forbidden = () => { throw new Error("network must not run"); };
    const requireDouble = (name: string) => {
      if (name === "../local-safety.js") return policy;
      if (name === "k6/http") return { default: { get: forbidden, post: forbidden } };
      if (name === "k6") return { check: forbidden, sleep: forbidden };
      if (name === "k6/metrics") return { Trend: class {}, Rate: class {}, Counter: class {} };
      throw new Error(`Unexpected dependency ${name}`);
    };
    const run = () => new Function("require", "exports", "__ENV", "open", compile(file))(
      requireDouble, {}, { ...valid, ...overrides }, (name: string) => { opened.push(name); throw new Error("session/evidence read before rejection"); },
    );
    return { run, opened };
  }
  it.each([
    { DATABASE_URL: "postgresql://u:synthetic@db.cloud.test:5432/db" },
    { DATABASE_URL: "postgresql://u:synthetic@localhost:5432/db?hostaddr=203.0.113.1" },
    { DATABASE_URL: "" }, { VERCEL_ENV: "preview" }, { VERCEL_AUTOMATION_BYPASS_SECRET: "synthetic-unused" },
    { NEXT_PUBLIC_SUPABASE_URL: "https://synthetic.supabase.co" }, { AWS_PROFILE: "synthetic-unused" },
    { BASE_URL: "http://127.1:3000" }, { BASE_URL: " http://localhost:3000" },
    { BASE_URL: "http://localhost:65536" }, { BASE_URL: "http://localhost:3000?host=cloud.test" },
  ])("refuses unsafe environment before opening any session or evidence: %j", (overrides) => {
    const harness = initialize(overrides);
    expect(harness.run).toThrow(/HOSTED_(?:PERF|K6)_DISABLED|DATABASE_URL/);
    expect(harness.opened).toEqual([]);
  });
});
