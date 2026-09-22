import { describe, expect, it } from "vitest";
import { suiteSetup } from "./helpers/global-state";
import { Pool } from "pg";
import { testConnectionString } from "./helpers/pg";

suiteSetup();

import { GET as healthGET } from "../src/app/api/health/route";

describe("GET /api/health (deployment diagnostics, never a 500, never secrets)", () => {
  it("does not report healthy when table names exist but columns are incompatible", async () => {
    const pool = new Pool({ connectionString: testConnectionString() });
    const previous = process.env.DATABASE_SCHEMA;
    try {
      await pool.query(`create schema incompatible;
        create table incompatible.agencies (id integer);
        create table incompatible.users (id integer);
        create table incompatible.site_settings (id integer);
        create table incompatible.visa_types (id integer, active boolean);
        create table incompatible.countries (id integer, active boolean);
        create table incompatible.schema_migrations (name text);
        insert into incompatible.schema_migrations values ('0001_init.sql'), ('0002_branding.sql');`);
      process.env.DATABASE_SCHEMA = "incompatible";
      const body = await (await healthGET()).json();
      expect(body.database.connected).toBe(true);
      expect(Object.values(body.schema.requiredTables).every(Boolean)).toBe(true);
      expect(body.schema.columnsValid).toBe(false);
      expect(body.database.error.code).toBe("42703");
      expect(body.ok).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.DATABASE_SCHEMA;
      else process.env.DATABASE_SCHEMA = previous;
      await pool.end();
    }
  });
  it("reports a connected, fully migrated database", async () => {
    const res = await healthGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.database.configured).toBe(true);
    expect(body.database.connected).toBe(true);
    expect(typeof body.database.latencyMs).toBe("number");
    expect(body.schema.requiredTables).toEqual({
      users: true,
      site_settings: true,
      visa_types: true,
      countries: true,
      schema_migrations: true,
    });
    expect(body.schema.migrationLedger).toEqual([
      "0001_init.sql",
      "0002_branding.sql",
      "0003_agency_registrations.sql",
      "0004_phase2_1.sql",
      "0005_canonical_decision_model.sql",
      "0006_simplified_status_model.sql",
    ]);
    // The report must never contain a connection URI (credentials).
    expect(JSON.stringify(body)).not.toMatch(/postgres(ql)?:\/\//i);
  });

  it("stays a 200 and reports the failure when the database is unreachable", async () => {
    const previous = process.env.DATABASE_URL;
    // Nothing listens on 127.0.0.1:1 — fails immediately with ECONNREFUSED.
    process.env.DATABASE_URL = "postgresql://postgres:example@127.0.0.1:1/essafaria";
    try {
      const res = await healthGET();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.database.configured).toBe(true);
      expect(body.database.connected).toBe(false);
      expect(body.database.error?.code).toBeTruthy();
      expect(JSON.stringify(body)).not.toMatch(/postgres(ql)?:\/\//i);
    } finally {
      process.env.DATABASE_URL = previous;
    }
  });

  it("says DATABASE_URL is missing when the deployment has none", async () => {
    const previous = process.env.DATABASE_URL;
    const previousVercel = process.env.VERCEL;
    delete process.env.DATABASE_URL;
    process.env.VERCEL = "1";
    try {
      const res = await healthGET();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.database.configured).toBe(false);
      expect(body.database.connected).toBe(false);
      expect(body.notes.join(" ")).toContain("DATABASE_URL is NOT set");
    } finally {
      if (previous !== undefined) process.env.DATABASE_URL = previous;
      else delete process.env.DATABASE_URL;
      if (previousVercel === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = previousVercel;
    }
  });
});
