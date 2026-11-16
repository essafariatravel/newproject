import { afterEach, describe, expect, it } from "vitest";
import { GET as liveGET } from "../src/app/api/health/live/route";
import { GET as readyGET } from "../src/app/api/health/ready/route";

const originalDatabaseUrl = process.env.DATABASE_URL;
const originalDatabaseSchema = process.env.DATABASE_SCHEMA;
const originalVercelEnv = process.env.VERCEL_ENV;

afterEach(() => {
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
  if (originalDatabaseSchema === undefined) delete process.env.DATABASE_SCHEMA;
  else process.env.DATABASE_SCHEMA = originalDatabaseSchema;
  if (originalVercelEnv === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = originalVercelEnv;
});

describe("low-cost health probes", () => {
  it("liveness stays healthy without requiring database configuration", async () => {
    delete process.env.DATABASE_URL;
    const response = await liveGET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      status: "healthy",
      service: "essafaria-visa-os",
    });
  });

  it("readiness validates configuration without exposing diagnostics", async () => {
    process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/essafaria";
    delete process.env.VERCEL_ENV;
    process.env.DATABASE_SCHEMA = "public";

    const response = await readyGET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      status: "healthy",
      service: "essafaria-visa-os",
    });
  });

  it("fails closed for invalid database configuration without connecting", async () => {
    process.env.DATABASE_URL = "not-a-postgres-url";
    delete process.env.VERCEL_ENV;

    const response = await readyGET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      status: "unavailable",
      service: "essafaria-visa-os",
    });
  });
});
