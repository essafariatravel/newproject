import { describe, expect, it } from "vitest";
import { suiteSetup } from "./helpers/global-state";
import { GET as healthGET } from "../src/app/api/health/route";
import { GET as liveGET } from "../src/app/api/health/live/route";
import { GET as deepGET } from "../src/app/api/internal/health/deep/route";

suiteSetup();

describe("health endpoints", () => {
  it("public health is minimal and reports readiness", async () => {
    const res = await healthGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "healthy", service: "essafaria-visa-os" });

    const serialized = JSON.stringify(body);
    expect(serialized).not.toMatch(/postgres(ql)?:\/\//i);
    expect(serialized).not.toMatch(/visa_os/i);
    expect(serialized).not.toMatch(/migration/i);
    expect(serialized).not.toMatch(/xgetzgixalrsmuvfthpf/i);
  });

  it("liveness does not expose dependency diagnostics", async () => {
    const res = await liveGET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: "healthy",
      service: "essafaria-visa-os",
    });
  });

  it("deep health is disabled when no operator token is configured", async () => {
    const previous = process.env.HEALTHCHECK_TOKEN;
    delete process.env.HEALTHCHECK_TOKEN;
    try {
      const res = await deepGET(
        new Request("http://localhost/api/internal/health/deep"),
      );
      expect(res.status).toBe(404);
    } finally {
      if (previous === undefined) delete process.env.HEALTHCHECK_TOKEN;
      else process.env.HEALTHCHECK_TOKEN = previous;
    }
  });

  it("deep health stays disabled with a weak operator token", async () => {
    const previous = process.env.HEALTHCHECK_TOKEN;
    process.env.HEALTHCHECK_TOKEN = "too-short";
    try {
      const res = await deepGET(
        new Request("http://localhost/api/internal/health/deep", {
          headers: { authorization: "Bearer too-short" },
        }),
      );
      expect(res.status).toBe(404);
    } finally {
      if (previous === undefined) delete process.env.HEALTHCHECK_TOKEN;
      else process.env.HEALTHCHECK_TOKEN = previous;
    }
  });

  it("deep health rejects an invalid operator token", async () => {
    const previous = process.env.HEALTHCHECK_TOKEN;
    process.env.HEALTHCHECK_TOKEN = "test-health-token-0123456789abcdef-XYZ";
    try {
      const res = await deepGET(
        new Request("http://localhost/api/internal/health/deep", {
          headers: { authorization: "Bearer wrong-token" },
        }),
      );
      expect(res.status).toBe(401);
    } finally {
      if (previous === undefined) delete process.env.HEALTHCHECK_TOKEN;
      else process.env.HEALTHCHECK_TOKEN = previous;
    }
  });

  it("deep health returns structural diagnostics only to an authorized operator", async () => {
    const previous = process.env.HEALTHCHECK_TOKEN;
    const token = "test-health-token-0123456789abcdef-XYZ";
    process.env.HEALTHCHECK_TOKEN = token;
    try {
      const res = await deepGET(
        new Request("http://localhost/api/internal/health/deep", {
          headers: { authorization: `Bearer ${token}` },
        }),
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.status).toBe("healthy");
      expect(body.database.connected).toBe(true);
      expect(body.schema.columnsValid).toBe(true);
      expect(body.schema.requiredTables.schema_migrations).toBe(true);
      expect(Array.isArray(body.schema.migrationLedger)).toBe(true);
      expect(body.releaseProtections.status).toBe("not_applicable");

      const serialized = JSON.stringify(body);
      expect(serialized).not.toMatch(/postgres(ql)?:\/\//i);
      if (process.env.DATABASE_URL) {
        expect(serialized).not.toContain(process.env.DATABASE_URL);
      }
      expect(serialized).not.toMatch(/xgetzgixalrsmuvfthpf/i);
    } finally {
      if (previous === undefined) delete process.env.HEALTHCHECK_TOKEN;
      else process.env.HEALTHCHECK_TOKEN = previous;
    }
  });
});
