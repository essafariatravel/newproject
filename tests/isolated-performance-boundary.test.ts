import { describe, expect, it } from "vitest";
import { databaseUrl, databasePoolConfig } from "../src/lib/database-config";
import { isolatedPerformanceContext, isolatedPerformanceConnection, targetsIsolatedPerformance } from "../src/lib/isolated-performance";

const ref = "catvumvhpvsujopcvxxy";
const url = `postgresql://capacity_runner_20261109.${ref}:synthetic@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=verify-full`;
const preview = {
  VERCEL: "1", VERCEL_ENV: "preview", VERCEL_TARGET_ENV: "preview",
  VERCEL_PROJECT_ID: "prj_g0JhQm6sgMOyOTXLWNHI8GYy3VYo",
  VERCEL_GIT_COMMIT_REF: "codex/isolated-capacity-test-20261109",
  DATABASE_SCHEMA: "visa_os_preview", DATABASE_URL: url,
};

describe("approved TEST-only hosted database boundary", () => {
  it("permits only the exact TEST Vercel project, branch, database role and schema", () => {
    expect(isolatedPerformanceContext(preview)).toBe(true);
    expect(isolatedPerformanceConnection(url)).toBe(true);
    expect(targetsIsolatedPerformance(url)).toBe(true);
    expect(databaseUrl(preview)).toBe(url);
    expect(databasePoolConfig(preview).options).toBe("-c search_path=pg_catalog,visa_os_preview");
  });

  it.each([
    { VERCEL: undefined }, { VERCEL_ENV: "production" }, { VERCEL_ENV: "development" },
    { VERCEL_PROJECT_ID: "prj_0WOxlorbYiljjjBvZ1Cm6M9JmPdp" },
    { VERCEL_GIT_COMMIT_REF: "main" }, { DATABASE_SCHEMA: "visa_os" },
    { VERCEL_TARGET_ENV: "production" },
    { DATABASE_URL: `postgresql://postgres.xgetzgixalrsmuvfthpf:synthetic@aws-0-us-east-1.pooler.supabase.com:5432/postgres` },
    { DATABASE_URL: `postgresql://capacity_runner_20261109.ridoyedqgiavgcwnpubq:synthetic@aws-0-us-east-1.pooler.supabase.com:5432/postgres` },
    { DATABASE_URL: `postgresql://postgres.${ref}:synthetic@aws-0-us-east-1.pooler.supabase.com:5432/postgres` },
  ])("denies changed or incomplete TEST deployment metadata: %j", (patch) => {
    expect(() => databaseUrl({ ...preview, ...patch })).toThrow(/boundary mismatch/i);
  });

  it.each([
    "?sslmode=disable", "?host=db.xgetzgixalrsmuvfthpf.supabase.co", "?options=-c%20search_path%3Dvisa_os",
    "?user=postgres.xgetzgixalrsmuvfthpf", "?sslmode=no-verify", "?port=6432",
  ])("denies SQL URL redirects and unsafe TLS: %s", (suffix) => {
    expect(isolatedPerformanceConnection(url.split("?")[0] + suffix)).toBe(false);
    expect(() => databaseUrl({ ...preview, DATABASE_URL: url.split("?")[0] + suffix })).toThrow(/boundary mismatch/i);
  });

  it("rejects TEST database credentials in every non-TEST branch including Production", () => {
    expect(() => databaseUrl({ ...preview, VERCEL_GIT_COMMIT_REF: "main" })).toThrow(/boundary mismatch/i);
    expect(() => databaseUrl({ ...preview, VERCEL_ENV: "production", DATABASE_SCHEMA: "visa_os" })).toThrow(/boundary mismatch/i);
  });
});
