import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { suiteSetup } from "./helpers/global-state";
import { Pool } from "pg";
import { readdirSync } from "node:fs";
import path from "node:path";
import { testConnectionString } from "./helpers/pg";
import { request } from "./helpers/request";
import { userByEmail } from "./helpers/fixtures";
import { createSession } from "@/lib/auth";

suiteSetup();
beforeEach(async()=>{request.cookie=(await createSession((await userByEmail("admin@test.example")).id)).token;});
afterEach(()=>{request.cookie="";});

/** Every migration file, in ledger order. */
const MIGRATION_FILES = readdirSync(path.join(__dirname, "..", "migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort();

import { GET as healthGET } from "../src/app/api/health/route";
import { GET as liveGET } from "../src/app/api/health/live/route";
import { GET as deepGET } from "../src/app/api/internal/health/deep/route";

describe("GET /api/health (deployment diagnostics, never a 500, never secrets)", () => {
  it("public and Agency monitoring expose only minimal readiness", async () => {
    request.cookie = "";
    const publicRes = await healthGET();
    expect(publicRes.status).toBe(200);
    expect(await publicRes.json()).toEqual({ status: "healthy", service: "essafaria-visa-os" });

    request.cookie = (await createSession((await userByEmail("a-admin@test.example")).id)).token;
    const agencyRes = await healthGET();
    expect(agencyRes.status).toBe(200);
    expect(await agencyRes.json()).toEqual({ status: "healthy", service: "essafaria-visa-os" });
  });
  it("liveness stays dependency-free and minimal", async () => {
    const res = await liveGET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "healthy", service: "essafaria-visa-os" });
  });

  it("deep diagnostics are disabled without an operator token and reject a wrong token", async () => {
    const previous = process.env.HEALTHCHECK_TOKEN;
    delete process.env.HEALTHCHECK_TOKEN;
    try {
      expect((await deepGET(new Request("http://localhost/api/internal/health/deep"))).status).toBe(404);
      process.env.HEALTHCHECK_TOKEN = "test-health-token";
      expect((await deepGET(new Request("http://localhost/api/internal/health/deep", {
        headers: { authorization: "Bearer wrong-token" },
      }))).status).toBe(401);
    } finally {
      if (previous === undefined) delete process.env.HEALTHCHECK_TOKEN;
      else process.env.HEALTHCHECK_TOKEN = previous;
    }
  });

  it("does not report healthy when table names exist but columns are incompatible", async () => {
    const pool = new Pool({ connectionString: testConnectionString() });
    const previous = process.env.DATABASE_SCHEMA;
    const isolatedSchema = `incompatible_${randomBytes(6).toString("hex")}`;
    try {
      await pool.query(`create schema ${isolatedSchema};
        create table ${isolatedSchema}.agencies (id integer);
        create table ${isolatedSchema}.users (id integer);
        create table ${isolatedSchema}.site_settings (id integer);
        create table ${isolatedSchema}.visa_types (id integer, active boolean);
        create table ${isolatedSchema}.countries (id integer, active boolean);
        create table ${isolatedSchema}.schema_migrations (name text);
        insert into ${isolatedSchema}.schema_migrations values ('0001_init.sql'), ('0002_branding.sql');`);
      process.env.DATABASE_SCHEMA = isolatedSchema;
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
    // The ledger must equal the migrations actually shipped on disk — this
    // stays true for every future migration without editing the test.
    expect(body.schema.migrationLedger).toEqual(MIGRATION_FILES);
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
