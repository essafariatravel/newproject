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
  it("creates an isolated application without modifying public tables", async () => {
    const pool = new Pool({ connectionString: testConnectionString() });
    try {
      const before = await pool.query("select id from public.users order by id");
      const directory = path.join(process.cwd(), "migrations");
      expect(await applyMigrations(pool, directory, "visa_os_preview")).toEqual([
        "0001_init.sql",
        "0002_branding.sql",
        "0003_agency_registrations.sql",
        "0004_phase2_1.sql",
        "0005_canonical_decision_model.sql",
      "0006_simplified_status_model.sql",
      "0007_must_change_password.sql",
      "0008_application_price_adjustments.sql",
      "0009_atomic_request_submission.sql", "0010_simplified_applicant.sql", 
      ]);
      expect(await applyMigrations(pool, directory, "visa_os_preview")).toEqual([]);
      await pool.query("select password_hash, name, role from visa_os_preview.users limit 0");
      expect((await pool.query("select id from public.users order by id")).rows).toEqual(before.rows);
    } finally {
      await pool.end();
    }
  });

  it("refuses an unrelated users table and rolls back its ledger", async () => {
    const pool = new Pool({ connectionString: testConnectionString() });
    try {
      await pool.query("create schema legacy_app; create table legacy_app.users (id int); insert into legacy_app.users values (1)");
      await expect(applyMigrations(pool, path.join(process.cwd(), "migrations"), "legacy_app"))
        .rejects.toThrow("Existing users table");
      expect((await pool.query("select * from legacy_app.users")).rows).toEqual([{ id: 1 }]);
      expect((await pool.query("select to_regclass('legacy_app.schema_migrations') as name")).rows[0].name).toBeNull();
    } finally {
      await pool.end();
    }
  });
  it("repeated and concurrent runs skip applied migrations and preserve user data", async () => {
    const pool = new Pool({ connectionString: testConnectionString() });
    try {
      const before = await pool.query("select id from users order by id");
      const directory = path.join(process.cwd(), "migrations");
      expect(await applyMigrations(pool, directory)).toEqual([]);
      expect(await Promise.all([applyMigrations(pool, directory), applyMigrations(pool, directory)])).toEqual([[], []]);
      expect((await pool.query("select id from users order by id")).rows).toEqual(before.rows);
      expect((await pool.query("select name from schema_migrations order by name")).rows)
        .toEqual([
          { name: "0001_init.sql" },
          { name: "0002_branding.sql" },
          { name: "0003_agency_registrations.sql" },
          { name: "0004_phase2_1.sql" },
          { name: "0005_canonical_decision_model.sql" },
          { name: "0006_simplified_status_model.sql" },
          { name: "0007_must_change_password.sql" },
          { name: "0008_application_price_adjustments.sql" },
          { name: "0009_atomic_request_submission.sql" },
          { name: "0010_simplified_applicant.sql" },
        ]);
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
