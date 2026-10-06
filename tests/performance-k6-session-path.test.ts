import { readFileSync } from "node:fs";
import { posix, win32, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve("perf/k6/essafaria-load.js"), "utf8");
const executable = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function initialize(
  paths: typeof posix,
  root: string,
  overrides: Record<string, string> = {},
) {
  const scriptDirectory = paths.join(root, "perf", "k6");
  const defaultSession = paths.join(root, "perf", ".runtime", "sessions.json");
  const opened: string[] = [];
  const forbiddenRuntimeCall = () => { throw new Error("HTTP/load execution is forbidden in this test"); };
  const requireDouble = (name: string) => {
    if (name === "k6/http") return { default: { get: forbiddenRuntimeCall, post: forbiddenRuntimeCall } };
    if (name === "k6") return { check: forbiddenRuntimeCall, sleep: forbiddenRuntimeCall };
    if (name === "k6/metrics") return { Trend: class {}, Rate: class {}, Counter: class {} };
    throw new Error("Unexpected harness dependency");
  };
  const openDouble = (file: string) => {
    opened.push(file);
    if (file === "../budgets.json") return JSON.stringify({ global: { errorRateMax: 0.01, unexpectedFailureRateMax: 0.01, p95Ms: 1000 }, operations: {} });
    if (file === "../.runtime/application-manifest.json") return JSON.stringify({
      datasetId: "synthetic-test",
      agencyApplicationIds: ["00000000-0000-4000-8000-000000000001"],
      staffApplicationIds: ["00000000-0000-4000-8000-000000000002"],
    });
    if (overrides.PERF_SESSION_FILE) {
      if (file !== overrides.PERF_SESSION_FILE) throw new Error("Session override changed");
    } else if (paths.resolve(scriptDirectory, file) !== defaultSession) {
      throw new Error("Default session path does not resolve to perf/.runtime/sessions.json");
    }
    // Synthetic placeholders only; never read or use real session tokens.
    return JSON.stringify({
      roles: Object.fromEntries(["AGENCY_USER", "AGENCY_ADMIN", "VISA_AGENT", "ACCOUNTING", "SUPER_ADMIN", "ADMIN"].map((role) => [role, Array.from({ length: 10 }, (_, index) => `synthetic-unused-${role}-${index}`)])),
      agencyApplicationIds: ["synthetic-application"],
      staffApplicationIds: ["synthetic-application"],
    });
  };
  const run = () => new Function("require", "exports", "__ENV", "open", executable)(
    requireDouble, {}, { PERF_ACK_NONPROD: "YES", BASE_URL: "https://preview.example.test", DATABASE_SCHEMA: "visa_os_preview", ...overrides }, openDouble,
  );
  return { run, opened };
}

describe("k6 session-file resolution (initialization only; no k6 process)", () => {
  it.each([
    { name: "POSIX", paths: posix, root: "/workspace/essafaria" },
    { name: "Windows with spaces", paths: win32, root: "C:\\Users\\Azur Computer\\Documents\\essafaria" },
  ])("resolves the default relative to perf/k6/essafaria-load.js on $name", ({ paths, root }) => {
    const harness = initialize(paths, root);
    expect(harness.run).not.toThrow();
    expect(harness.opened).toEqual(["../.runtime/sessions.json", "../.runtime/application-manifest.json", "../budgets.json"]);
  });

  it.each([
    "/workspace/custom/sessions.json",
    "C:\\Users\\Azur Computer\\custom\\sessions.json",
    "../.runtime/custom-sessions.json",
  ])("preserves PERF_SESSION_FILE override %s", (file) => {
    const harness = initialize(posix, "/workspace/essafaria", { PERF_SESSION_FILE: file });
    expect(harness.run).not.toThrow();
    expect(harness.opened[0]).toBe(file);
  });

  it("refuses Production before opening session data", () => {
    const harness = initialize(posix, "/workspace/essafaria", { BASE_URL: "https://visa.essafariavoyages.com" });
    expect(harness.run).toThrow("refuses the Production hostname");
    expect(harness.opened).toEqual([]);
  });

  it("requires non-Production acknowledgement before opening session data", () => {
    const harness = initialize(posix, "/workspace/essafaria", { PERF_ACK_NONPROD: "" });
    expect(harness.run).toThrow("PERF_ACK_NONPROD=YES is required");
    expect(harness.opened).toEqual([]);
  });
});
