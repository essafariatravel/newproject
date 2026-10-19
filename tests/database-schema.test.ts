import { describe, expect, it } from "vitest";
import { databaseSchema, qualifiedTable } from "../src/lib/database-schema";

describe("application schema selection", () => {
  it("keeps existing installations on public and supports isolated deployments", () => {
    expect(databaseSchema({})).toBe("public");
    expect(databaseSchema({ DATABASE_SCHEMA: "visa_os_preview" })).toBe("visa_os_preview");
    expect(qualifiedTable("users", "visa_os_preview")).toBe('"visa_os_preview"."users"');
  });
  it("rejects reserved schemas and SQL injection", () => {
    for (const name of ["auth", "storage", "pg_catalog", "public;drop schema public", 'bad"name']) {
      expect(() => databaseSchema({ DATABASE_SCHEMA: name })).toThrow();
    }
  });
  it("hard-stops hosted Preview/Production schema crossover when a DB is configured", () => {
    const configured = "postgresql://postgres:secret@db.example.test/postgres";
    expect(databaseSchema({ VERCEL_ENV: "preview", DATABASE_URL: configured, DATABASE_SCHEMA: "visa_os_preview" })).toBe("visa_os_preview");
    expect(databaseSchema({ VERCEL_ENV: "production", DATABASE_URL: configured, DATABASE_SCHEMA: "visa_os" })).toBe("visa_os");
    expect(() => databaseSchema({ VERCEL_ENV: "preview", DATABASE_URL: configured, DATABASE_SCHEMA: "visa_os" })).toThrow(/boundary mismatch/i);
    expect(() => databaseSchema({ VERCEL_ENV: "production", DATABASE_URL: configured, DATABASE_SCHEMA: "visa_os_preview" })).toThrow(/boundary mismatch/i);
    // Build imports remain safe when no database binding exists at all.
    expect(databaseSchema({ VERCEL_ENV: "preview" })).toBe("public");
  });

});
