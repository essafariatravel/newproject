import { describe, expect, it } from "vitest";
import { assertAuthPreviewArtifact } from "../src/lib/auth-test-lab";
import { databasePoolConfig, databaseUrl } from "../src/lib/database-config";

const ref = "zdmzcomcztchocdxxjhf";
const productionRef = "xgetzgixalrsmuvfthpf";
const pooler = "aws-9-synthetic-region-1.pooler.supabase.com";
const url = `postgresql://essafaria_preview_app.${ref}:synthetic@${pooler}:6543/postgres`;
const productionUrl = `postgresql://postgres.${productionRef}:synthetic@${pooler}:6543/postgres`;
const env = {
  VERCEL: "1",
  VERCEL_ENV: "preview",
  VERCEL_TARGET_ENV: "preview",
  VERCEL_PROJECT_ID: "prj_0WOxlorbYiljjjBvZ1Cm6M9JmPdp",
  VERCEL_GIT_COMMIT_REF: "codex/auth-bot-lockout-20261110",
  DATABASE_SCHEMA: "visa_os_preview",
  DATABASE_URL: url,
  ESSAFARIA_READONLY_BUILD: "true",
  ALLOW_DEMO_SEED: "false",
  PREVIEW_ADMIN_BOOTSTRAP: "false",
  STORAGE_PROVIDER: "db",
  STORAGE_OPERATIONS_ENABLED: "false",
  TRANSACTIONAL_EMAIL_PROVIDER: "disabled",
  MFA_ENFORCEMENT_ENABLED: "true",
};

describe("Auth candidate TEST LAB boundary", () => {
  it("permits the dedicated role and lab project with verified TLS", () => {
    const isolated = { ...env, newpro_POSTGRES_URL: "essafaria-preview-disabled" };
    expect(() => assertAuthPreviewArtifact(isolated)).not.toThrow();
    expect(databasePoolConfig(isolated)).toMatchObject({
      connectionString: url, options: "-c search_path=pg_catalog,visa_os_preview",
      ssl: { rejectUnauthorized: true },
    });
  });

  it.each([
    { VERCEL: undefined },
    { VERCEL_ENV: "production" },
    { VERCEL_TARGET_ENV: "staging" },
    { VERCEL_GIT_COMMIT_REF: undefined },
    { VERCEL_GIT_COMMIT_REF: "main" },
    { VERCEL_PROJECT_ID: "prj_other" },
    { DATABASE_SCHEMA: "visa_os" },
    { DATABASE_URL: undefined },
    { DATABASE_URL: productionUrl },
    { DATABASE_URL: `postgresql://postgres:synthetic@db.${productionRef}.supabase.co:5432/postgres` },
    { DATABASE_URL: url.replace(ref, "nqudhszgodmzckautrby") },
    { DATABASE_URL: url.replace("essafaria_preview_app.", "postgres.") },
    { DATABASE_URL: url.replace(pooler, pooler + ".invalid.example") },
    { DATABASE_URL: url.replace(":6543", ":5432") },
    { DATABASE_URL: url + "?host=db." + productionRef + ".supabase.co" },
    { DATABASE_URL: url + "?user=postgres." + productionRef },
    { DATABASE_URL: url + "?sslmode=disable" },
    { MIGRATION_DATABASE_URL: productionUrl },
    { ESSAFARIA_READONLY_BUILD: "false" },
    { ALLOW_DEMO_SEED: "true" },
    { PREVIEW_ADMIN_BOOTSTRAP: "true" },
    { STORAGE_PROVIDER: "supabase" },
    { MFA_ENFORCEMENT_ENABLED: "false" },
    { newpro_POSTGRES_PASSWORD: "synthetic-inherited" },
    { SUPABASE_SERVICE_ROLE_KEY: "synthetic-inherited" },
    { PGOPTIONS: "-c search_path=visa_os" },
  ])("refuses a misconfigured candidate %#", (patch) => {
    const invalid = { ...env, ...patch };
    expect(() => assertAuthPreviewArtifact(invalid)).toThrow(/boundary mismatch/i);
    expect(() => databaseUrl(invalid)).toThrow(/boundary mismatch/i);
  });

  it("fails closed in build and runtime even when all hosted metadata is missing", () => {
    expect(() => assertAuthPreviewArtifact({ DATABASE_URL: productionUrl })).toThrow(/boundary mismatch/i);
    expect(() => assertAuthPreviewArtifact({ DATABASE_URL: url })).toThrow(/boundary mismatch/i);
  });

  it("rejects inherited Supabase credentials even with a loopback database", () => {
    expect(() => assertAuthPreviewArtifact({
      DATABASE_URL: "postgresql://localhost:5434/essafaria_test",
      SUPABASE_URL: `https://${productionRef}.supabase.co`,
    })).toThrow(/boundary mismatch/i);
  });

  it("refuses the normal migration entry point for the candidate", () => {
    expect(() => databaseUrl(env, true)).toThrow(/boundary mismatch/i);
  });

  it("keeps ordinary loopback use and rejects loopback URI overrides", () => {
    expect(() => assertAuthPreviewArtifact({})).not.toThrow();
    expect(() => assertAuthPreviewArtifact({ DATABASE_URL: "postgresql://localhost:5434/essafaria_test" })).not.toThrow();
    expect(() => assertAuthPreviewArtifact({ DATABASE_URL: "postgresql://localhost/test?host=external.example" })).toThrow(/boundary mismatch/i);
  });
});
