import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Pool } from "pg";
import { suiteSetup } from "./helpers/global-state";
import { testConnectionString } from "./helpers/pg";
import { applyMigrations } from "../scripts/lib/migrations";

suiteSetup();

describe("safe migrations against isolated test PostgreSQL", () => {
  it("repeated and concurrent runs skip applied migrations and preserve user data", async () => {
    const pool = new Pool({ connectionString: testConnectionString() });
    try {
      const before = await pool.query("select id from users order by id");
      const directory = path.join(process.cwd(), "migrations");
      expect(await applyMigrations(pool, directory)).toEqual([]);
      expect(await Promise.all([applyMigrations(pool, directory), applyMigrations(pool, directory)])).toEqual([[], []]);
      expect((await pool.query("select id from users order by id")).rows).toEqual(before.rows);
      expect((await pool.query("select name from schema_migrations order by name")).rows)
        .toEqual([{ name: "0001_init.sql" }, { name: "0002_branding.sql" }]);
    } finally {
      await pool.end();
    }
  });

  it("rolls back DDL and bookkeeping together on failure", async () => {
    const pool = new Pool({ connectionString: testConnectionString() });
    const directory = await mkdtemp(path.join(tmpdir(), "essafaria-migration-test-"));
    try {
      await writeFile(path.join(directory, "9998_probe.sql"), "create table migration_rollback_probe (id integer);");
      await writeFile(path.join(directory, "9999_failure.sql"), "select * from intentionally_missing_migration_table;");
      await expect(applyMigrations(pool, directory)).rejects.toThrow();
      expect((await pool.query("select to_regclass('public.migration_rollback_probe') as name")).rows[0].name).toBeNull();
      expect((await pool.query("select name from schema_migrations where name like '999%'")).rows).toEqual([]);
    } finally {
      await pool.end();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
