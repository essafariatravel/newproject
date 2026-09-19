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
});
