import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const executable = ts.transpileModule(readFileSync(resolve("perf/k6/essafaria-load.js"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const actionId = "a".repeat(40);
// This harness never makes real HTTP requests; use loopback to satisfy the hosted-k6 guard.
const base = "http://127.0.0.1:3000";
type Request = { url: string; body?: string | null; options: { headers?: Record<string, string>; tags?: Record<string, string> } };
function harness(profile = "tier", actionResponse = '1:{"expired":false}\n', chunk = `(0,n.createServerReference)("${actionId}",n.callServer,void 0,n.findSourceMapURL,"touchSessionAction")`, configuration: { vus?: number; preflightDurationMs?: number; invalidPreflightIndex?: number; incompleteBatch?: boolean } = {}) {
  const calls: Request[] = [], failures: boolean[] = [];
  let now = 1_000_000, lastActivity = now;
  let preflightCount = 0, inBatch = false;
  const setupStarted = now, batches: number[] = [];
  const roles = ["AGENCY_USER", "AGENCY_ADMIN", "VISA_AGENT", "ACCOUNTING", "SUPER_ADMIN", "ADMIN"];
  const get = (url: string, options: Request["options"]) => {
        calls.push({ url, options });
        if (options.tags?.operation === "setup_session_preflight") {
          preflightCount++;
          if (!inBatch) now += configuration.preflightDurationMs ?? 0;
          if (now - setupStarted > 60_000) throw Error("k6 setup deadline exceeded");
        }
        const status = options.tags?.operation === "setup_session_preflight" && preflightCount === configuration.invalidPreflightIndex ? 403 : now - lastActivity < 30 * 60_000 ? 200 : 401;
        return { status, timings: { duration: 10 }, body: url.endsWith(".js") ? chunk : '<script src="/_next/static/session.js"></script>', json: () => ({ status: "healthy", service: "essafaria-visa-os" }) };
  };
  const requireDouble = (name: string) => {
    if (name === "k6/http") return { default: {
      get,
      batch: (requests: Array<{ method: string; url: string; params: Request["options"] }>) => {
        batches.push(requests.length);
        if (requests.length > 6) throw Error("Session preflight concurrency exceeded six requests");
        now += configuration.preflightDurationMs ?? 0;
        inBatch = true;
        const responses = requests.map(request => {
          if (request.method !== "GET") throw Error("Session preflight must be read-only");
          return get(request.url, request.params);
        });
        inBatch = false;
        if (configuration.incompleteBatch) responses.pop();
        return responses;
      },
      post: (url: string, body: string | null, options: Request["options"]) => {
        calls.push({ url, body, options });
        if (options.headers?.["Next-Action"] === actionId && actionResponse.includes('"expired":false')) lastActivity = now;
        return { status: 200, body: actionResponse, timings: { duration: 10 } };
      },
    } };
    if (name === "k6") return { check: (response: unknown, checks: Record<string, (r: unknown) => boolean>) => Object.values(checks).every(check => check(response)), sleep: () => {} };
    if (name === "k6/metrics") return { Trend: class { add() {} }, Counter: class { add() {} }, Rate: class { add(failure: boolean) { failures.push(failure); } } };
    throw Error("Unexpected harness dependency");
  };
  const openDouble = (file: string) => JSON.stringify(file.endsWith("budgets.json") ? { global: { errorRateMax: .01, unexpectedFailureRateMax: .01, p95Ms: 2000 }, operations: { session_activity: {} } } : file.endsWith("sessions.json") ? { roles: Object.fromEntries(roles.map(role => [role, Array.from({ length: Math.max(10, configuration.vus ?? 10) }, (_, i) => `synthetic-unused-${role}-${i}`)])) } : { agencyApplicationIds: ["synthetic-agency-dossier"], staffApplicationIds: ["synthetic-staff-dossier"] });
  const exports: { setup?: () => Record<string, unknown>; default?: (data: Record<string, unknown>) => void } = {};
  new Function("require", "exports", "__ENV", "open", "__VU", "__ITER", "Date", executable)(requireDouble, exports, { PERF_ACK_NONPROD: "YES", BASE_URL: base, DATABASE_SCHEMA: "visa_os_preview", PERF_PROFILE: profile, PERF_VUS: String(configuration.vus ?? 10) }, openDouble, 2, 1, { now: () => now });
  return { calls, failures, batches, setup: () => exports.setup!(), navigate: (data: Record<string, unknown>) => exports.default!(data), advance: (ms: number) => { now += ms; }, elapsedMs: () => now - setupStarted };
}

describe("representative active-user load session behavior", () => {
  it("negotiates compressed responses for all preflight, discovery, API and active-navigation requests", () => {
    const run = harness("tier", undefined, undefined, { vus: 1000 });
    const data = run.setup();
    run.navigate(data);
    expect(run.calls.filter(call => call.options.tags?.operation === "setup_session_preflight")).toHaveLength(1000);
    expect(run.calls.some(call => call.url.endsWith(".js"))).toBe(true);
    expect(run.calls.some(call => call.options.tags?.operation === "session_activity")).toBe(true);
    expect(run.calls.some(call => call.options.tags?.operation?.startsWith("staff_"))).toBe(true);
    expect(run.calls.every(call => call.options.headers?.["Accept-Encoding"] === "gzip")).toBe(true);
  });
  it("validates all 1000 distinct sessions within the setup deadline using bounded read-only batches", () => {
    const run = harness("tier", undefined, undefined, { vus: 1000, preflightDurationMs: 120 });
    expect(() => run.setup()).not.toThrow();
    const checks = run.calls.filter(call => call.options.tags?.operation === "setup_session_preflight");
    expect(checks).toHaveLength(1000);
    expect(new Set(checks.map(call => call.options.headers?.cookie)).size).toBe(1000);
    expect(run.batches.length).toBeGreaterThan(0);
    expect(Math.max(...run.batches)).toBeLessThanOrEqual(6);
    expect(run.elapsedMs()).toBeLessThan(60_000);
  });
  it("rejects an unauthorized session in the final 1000-user batch before health or workload requests", () => {
    const run = harness("tier", undefined, undefined, { vus: 1000, preflightDurationMs: 120, invalidPreflightIndex: 1000 });
    expect(() => run.setup()).toThrow(/Synthetic session preflight failed.*VU 1000.*HTTP 403/);
    expect(run.calls).toHaveLength(1000);
    expect(run.calls.every(call => call.options.tags?.operation === "setup_session_preflight")).toBe(true);
  });
  it("rejects missing batch responses rather than silently skipping a session", () => {
    const run = harness("tier", undefined, undefined, { incompleteBatch: true });
    expect(() => run.setup()).toThrow(/session preflight.*incomplete/i);
    expect(run.calls.some(call => call.url.endsWith("/api/health"))).toBe(false);
  });
  it("models real interaction throughout a Staff workload longer than the idle limit", () => {
    const run = harness(); const data = run.setup();
    for (let i = 0; i < 40; i++) { run.navigate(data); run.advance(60_000); }
    const activity = run.calls.filter(c => c.options.tags?.operation === "session_activity");
    expect(activity).toHaveLength(40);
    expect(run.failures).not.toContain(true);
    expect(activity.every(c => c.body === "[]" && c.options.headers?.Origin === base && c.options.headers?.["Next-Action"] === actionId && c.options.headers?.cookie?.includes("synthetic-unused-VISA_AGENT-0"))).toBe(true);
  });
  it("throttles interaction to once per minute without reducing navigations", () => {
    const run = harness(); const data = run.setup();
    run.navigate(data); run.advance(59_999); run.navigate(data); run.advance(1); run.navigate(data);
    expect(run.calls.filter(c => c.options.tags?.operation === "session_activity")).toHaveLength(2);
    expect(run.calls.filter(c => c.options.tags?.operation?.startsWith("staff_"))).toHaveLength(3);
  });
  it("background-only polling never refreshes an idle session", () => {
    const run = harness("polling-only"); const data = run.setup(); run.navigate(data); run.advance(31 * 60_000); run.navigate(data);
    expect(run.calls.some(c => c.options.tags?.operation === "session_activity")).toBe(false);
    expect(run.failures).toContain(true);
  });
  it.each(['1:{"expired":true}\n', '1:{"unexpected":false}\n'])("fails closed for a rejected or malformed interaction response %s", response => {
    const run = harness("tier", response); const data = run.setup();
    expect(() => run.navigate(data)).toThrow(/interaction|activity|session/i);
    expect(run.calls.some(c => c.options.tags?.operation?.startsWith("staff_"))).toBe(false);
  });
  it.each(["unrelated bundle", `(0,n.createServerReference)("${actionId}",n.callServer,void 0,n.findSourceMapURL,"logoutAction")`, `(0,n.createServerReference)("${actionId}",n.callServer,void 0,n.findSourceMapURL,"touchSessionAction");(0,n.createServerReference)("${"b".repeat(40)}",n.callServer,void 0,n.findSourceMapURL,"touchSessionAction")`])("refuses missing, unrelated or ambiguous deployed action references", chunk => {
    expect(() => harness("tier", undefined, chunk).setup()).toThrow(/interaction|activity|session/i);
  });
});
