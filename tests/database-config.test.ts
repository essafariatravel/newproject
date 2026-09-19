import { describe, expect, it, vi } from "vitest";
import { databasePoolConfig, databaseUrl, targetsSupabaseProject } from "../src/lib/database-config";

describe("database configuration", () => {
  it("fails safe (no throw) when a deployment lacks DATABASE_URL", () => {
    expect(databaseUrl({})).toContain("localhost");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    // Never throws: `next build` imports route modules with VERCEL=1 while
    // collecting page data, so an import-time throw fails Preview builds.
    for (const env of [{ NODE_ENV: "production" }, { VERCEL: "1" }]) {
      expect(databaseUrl(env)).toMatch(/^postgresql:\/\/127\.0\.0\.1:1\//);
    }
    expect(databaseUrl({ VERCEL: "1" }, true)).toMatch(/^postgresql:\/\/127\.0\.0\.1:1\//);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("keeps DATABASE_URL canonical and migration credentials CLI-only", () => {
    const env = {
      DATABASE_URL: "postgresql://runtime:example@runtime.example:6543/postgres",
      MIGRATION_DATABASE_URL: "postgresql://migrator:example@direct.example:5432/postgres",
      VERCEL: "1",
    };
    expect(databasePoolConfig(env).connectionString).toBe(env.DATABASE_URL);
    expect(databasePoolConfig(env).max).toBe(3);
    expect(databasePoolConfig(env, true).connectionString).toBe(env.MIGRATION_DATABASE_URL);
    expect(databasePoolConfig(env, true).max).toBe(1);
    expect(databaseUrl({ DATABASE_URL: env.DATABASE_URL }, true)).toBe(env.DATABASE_URL);
  });

  it("rejects API URLs and malformed configuration without echoing credentials", () => {
    for (const value of ["https://project.supabase.co", "secret-invalid-value", "postgresql://host"]) {
      expect(() => databaseUrl({ DATABASE_URL: value })).toThrow("Database configuration must be a PostgreSQL connection URI.");
    }
  });

  it("checks the requested Supabase project for direct and pooler connections", () => {
    const ref = "xgetzgixalrsmuvfthpf";
    expect(targetsSupabaseProject(`postgresql://postgres:example@db.${ref}.supabase.co/postgres`, ref)).toBe(true);
    expect(targetsSupabaseProject(`postgresql://postgres.${ref}:example@aws-0-region.pooler.supabase.com:6543/postgres`, ref)).toBe(true);
    expect(targetsSupabaseProject("postgresql://postgres.other:example@aws-0-region.pooler.supabase.com:6543/postgres", ref)).toBe(false);
    expect(targetsSupabaseProject(`postgresql://postgres.${ref}:example@pooler.supabase.com.attacker.test/postgres`, ref)).toBe(false);
  });
});
