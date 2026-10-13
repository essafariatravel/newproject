import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const databaseBoundary = "SEED_DATABASE_ACCESS_BLOCKED_BY_TEST";
const optedInRemote = {
  DATABASE_URL: "postgresql://fixture:synthetic@seed-target.invalid/fixture",
  ALLOW_DEMO_SEED: "true",
  SEED_ADMIN_PASSWORD: "Synthetic-Admin-123",
  SEED_AGENCY_PASSWORD: "Synthetic-Agency-123",
};
let directory: string;
let preload: string;

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), "essafaria-seed-policy-"));
  preload = join(directory, "boundary.cjs");
  // Exercise the actual CLI and configuration. Replace only environment-file
  // loading and the external database/network boundary, before any connection.
  writeFileSync(preload, `
    const Module = require("node:module");
    const load = Module._load;
    Module._load = function (name, ...args) {
      if (name === "@next/env") return { loadEnvConfig() {} };
      return load.call(this, name, ...args);
    };
    function stop() {
      process.stderr.write(${JSON.stringify(databaseBoundary + "\n")});
      process.exit(91);
    }
    const { Pool, Client } = require(require.resolve("pg", { paths: [${JSON.stringify(root)}] }));
    Pool.prototype.query = stop;
    Pool.prototype.connect = stop;
    Client.prototype.connect = stop;
  `);
});

afterAll(() => {
  if (dirname(directory) !== resolve(tmpdir()) || !directory.startsWith(join(tmpdir(), "essafaria-seed-policy-"))) {
    throw new Error("Unexpected seed-policy fixture cleanup path.");
  }
  rmSync(directory, { recursive: true, force: true });
});

function runSeed(env: Record<string, string>) {
  const inherited: NodeJS.ProcessEnv = { NODE_ENV: "test" };
  for (const key of ["PATH", "Path", "SystemRoot", "WINDIR", "TEMP", "TMP"]) {
    if (process.env[key]) inherited[key] = process.env[key];
  }
  return spawnSync(process.execPath, ["--require", preload, "--import", "tsx", join(root, "scripts/seed.ts")], {
    cwd: root,
    env: { ...inherited, NODE_ENV: "test", DATABASE_SCHEMA: "public", ...env },
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    timeout: 20_000,
  });
}

function expectRefusal(env: Record<string, string>, reason: RegExp) {
  const result = runSeed(env);
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(1);
  expect(result.stderr).toMatch(reason);
  expect(result.stderr).not.toContain(databaseBoundary);
  expect(result.stdout).not.toContain("Seed complete.");
  expect(result.stderr).not.toContain("Synthetic-Admin-123");
  expect(result.stderr).not.toContain("Synthetic-Agency-123");
}

describe("demo seed CLI target policy", () => {
  it.each([
    "postgresql://fixture:synthetic@127.0.0.1:1/fixture",
    optedInRemote.DATABASE_URL,
  ])("refuses the Production schema without a Vercel marker: %s", (DATABASE_URL) => {
    expectRefusal({ ...optedInRemote, DATABASE_URL, DATABASE_SCHEMA: "visa_os" }, /demo seeding.*production/i);
  });

  it("refuses controlled remote Preview even with consent and nondefault passwords", () => {
    expectRefusal({ ...optedInRemote, DATABASE_SCHEMA: "visa_os_preview" }, /demo seeding.*controlled.*preview/i);
  });

  it("keeps the controlled remote Preview refusal with production-mode builds", () => {
    expectRefusal({ ...optedInRemote, DATABASE_SCHEMA: "visa_os_preview", NODE_ENV: "production" }, /demo seeding.*controlled.*preview/i);
  });

  it("does not mistake a hostname containing localhost for a loopback fixture", () => {
    expectRefusal({ ...optedInRemote, DATABASE_URL: "postgresql://fixture:synthetic@localhost.seed-target.invalid/fixture", DATABASE_SCHEMA: "visa_os_preview" }, /demo seeding.*controlled.*preview/i);
  });

  it.each([
    "host=seed-target.invalid",
    "%68ost=seed-target.invalid",
    "host=localhost&host=seed-target.invalid",
  ])("refuses a driver host override hiding behind a loopback URI: %s", (query) => {
    expectRefusal({ ...optedInRemote, DATABASE_URL: `postgresql://fixture:synthetic@localhost:1/fixture?${query}`, DATABASE_SCHEMA: "visa_os_preview" }, /connection uri.*overrides.*disabled/i);
  });

  it.each([
    { host: "localhost", query: "options=-csearch_path=visa_os" },
    { host: "seed-target.invalid", query: "options=-c%20search_path%3Dvisa_os_preview" },
    { host: "localhost", query: "%6fptions=-csearch_path=visa_os" },
    { host: "localhost", query: "options=-csearch_path=public&options=-csearch_path=visa_os" },
  ])("refuses URI search_path overrides for public tables: $host $query", ({ host, query }) => {
    expectRefusal({ ...optedInRemote, DATABASE_URL: `postgresql://fixture:synthetic@${host}:1/fixture?${query}`, DATABASE_SCHEMA: "public" }, /connection uri.*overrides.*disabled/i);
  });

  it("keeps the Production deployment refusal when the database is unconfigured", () => {
    expectRefusal({ VERCEL_ENV: "production", VERCEL: "1" }, /demo seeding.*production/i);
  });

  it.each(["localhost", "127.0.0.1", "[::1]"])("preserves disposable loopback development seeding on %s", (host) => {
    const result = runSeed({ DATABASE_URL: `postgresql://fixture:synthetic@${host}:1/fixture`, DATABASE_SCHEMA: "visa_os_preview" });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(91);
    expect(result.stderr).toContain(databaseBoundary);
  });

  it("keeps explicit demo consent required for other remote schemas", () => {
    expectRefusal({ DATABASE_URL: optedInRemote.DATABASE_URL, DATABASE_SCHEMA: "demo_fixture" }, /remote demo seeding requires explicit/i);
  });

  it("preserves explicitly opted-in remote demo schemas outside controlled acceptance", () => {
    const result = runSeed({ ...optedInRemote, DATABASE_SCHEMA: "demo_fixture" });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(91);
    expect(result.stderr).toContain(databaseBoundary);
  });

  it("permits ordinary loopback fixture URLs with a nonrouting connection parameter", () => {
    const result = runSeed({ DATABASE_URL: "postgresql://fixture:synthetic@localhost:1/fixture?application_name=seed-fixture" });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(91);
    expect(result.stderr).toContain(databaseBoundary);
  });
});
