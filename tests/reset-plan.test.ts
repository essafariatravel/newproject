import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { assertDryRunTarget, dependencyDeleteOrder, parseResetOptions } from "../scripts/lib/reset-plan";

function invokeReset(args: string[], overrides: Record<string, string> = {}) {
  // Port 1 cannot reach the managed test cluster. Even the unsafe baseline cannot delete data.
  return spawnSync(process.execPath, ["--import", "tsx", "scripts/reset.ts", ...args], {
    cwd: process.cwd(), encoding: "utf8", timeout: 10_000,
    env: { ...process.env, DATABASE_URL: "postgresql://reset:unconfigured@127.0.0.1:1/unreachable", DATABASE_SCHEMA: "public", ...overrides },
  });
}

describe("go-live reset fails closed", () => {
  it("refuses every request to execute deletion", () => {
    const result = invokeReset(["--execute"]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Execution is disabled");
    expect(result.stderr).not.toContain("unconfigured");
  });
  it("refuses Production schema before opening a connection", () => {
    const result = invokeReset(["--dry-run"], { DATABASE_SCHEMA: "visa_os" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Production reset planning is forbidden");
  });
  it("refuses Production environment before opening a connection", () => {
    const result = invokeReset(["--dry-run"], { VERCEL_ENV: "production" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Production reset planning is forbidden");
  });
});

describe("reset plan policy", () => {
  it("accepts only explicit local snapshots and never a remote target", () => {
    expect(assertDryRunTarget({ DATABASE_URL: "postgresql://reset:secret@localhost:5434/restore_check", DATABASE_SCHEMA: "visa_os_preview" })).toEqual({ schema: "visa_os_preview" });
    expect(() => assertDryRunTarget({ DATABASE_URL: "postgresql://reset:secret@preview.invalid/db", DATABASE_SCHEMA: "visa_os_preview" })).toThrow("Remote reset planning is disabled");
    expect(() => assertDryRunTarget({})).toThrow("DATABASE_URL must be supplied explicitly");
    expect(() => assertDryRunTarget({ DATABASE_URL: "postgresql://localhost/db", VERCEL: "1" })).toThrow("Production reset planning is forbidden");
  });
  it("orders child tables before parents and refuses dependency cycles", () => {
    expect(dependencyDeleteOrder(["users", "agencies", "sessions"], [{ child: "sessions", parent: "users" }, { child: "users", parent: "agencies" }])).toEqual(["sessions", "users", "agencies"]);
    expect(() => dependencyDeleteOrder(["a", "b"], [{ child: "a", parent: "b" }, { child: "b", parent: "a" }])).toThrow("manual review");
  });
  it("deduplicates preserved UUIDs and rejects malformed identities and execution aliases", () => {
    const id = "abcdefab-1234-1234-1234-123456789abc";
    expect(parseResetOptions(["--preserve-user", id.toUpperCase(), "--preserve-user", id]).preserveUsers).toEqual([id]);
    expect(() => parseResetOptions(["--preserve-user", "all"])).toThrow("Invalid preserved user");
    for (const flag of ["--force", "--yes", "--confirm"]) expect(() => parseResetOptions([flag])).toThrow("Execution is disabled");
  });
  it("produces an offline blueprint without connecting or exposing connection secrets", () => {
    const result = invokeReset(["--blueprint"]);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ mode: "OFFLINE_BLUEPRINT", executionAvailable: false });
    expect(result.stdout).not.toContain("unconfigured");
  });
});
