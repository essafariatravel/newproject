import { describe, expect, it } from "vitest";
import { suiteSetup } from "./helpers/global-state";
import { databaseObservabilitySnapshot } from "@/lib/database-observability";
import { GET as databaseHealthGET } from "../src/app/api/internal/health/database/route";

suiteSetup();

describe("database observability", () => {
  it("returns a safe aggregate snapshot", async () => {
    const snapshot = await databaseObservabilitySnapshot();
    expect(["healthy", "degraded"]).toContain(snapshot.status);
    expect(snapshot.connections?.max).toBeGreaterThan(0);
    expect(snapshot.connections?.total).toBeGreaterThanOrEqual(1);
    expect(snapshot.transactions?.waitingLocks).toBeGreaterThanOrEqual(0);
    expect(snapshot.storage?.databaseBytes).toBeGreaterThan(0);
    expect(snapshot.storage?.schemaBytes).toBeGreaterThan(0);

    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toMatch(/postgres(ql)?:\/\//i);
    expect(serialized).not.toMatch(/select |insert |update |delete /i);
    expect(serialized).not.toMatch(/@/);
  });

  it("keeps the endpoint disabled without the operator token", async () => {
    const previous = process.env.HEALTHCHECK_TOKEN;
    delete process.env.HEALTHCHECK_TOKEN;
    try {
      const res = await databaseHealthGET(
        new Request("http://localhost/api/internal/health/database"),
      );
      expect(res.status).toBe(404);
    } finally {
      if (previous === undefined) delete process.env.HEALTHCHECK_TOKEN;
      else process.env.HEALTHCHECK_TOKEN = previous;
    }
  });

  it("returns the snapshot only with the correct operator token", async () => {
    const previous = process.env.HEALTHCHECK_TOKEN;
    process.env.HEALTHCHECK_TOKEN = "test-database-health-token";
    try {
      const denied = await databaseHealthGET(
        new Request("http://localhost/api/internal/health/database", {
          headers: { authorization: "Bearer wrong-token" },
        }),
      );
      expect(denied.status).toBe(401);

      const allowed = await databaseHealthGET(
        new Request("http://localhost/api/internal/health/database", {
          headers: { authorization: "Bearer test-database-health-token" },
        }),
      );
      expect(allowed.status).toBe(200);
      const body = await allowed.json();
      expect(["healthy", "degraded"]).toContain(body.status);
    } finally {
      if (previous === undefined) delete process.env.HEALTHCHECK_TOKEN;
      else process.env.HEALTHCHECK_TOKEN = previous;
    }
  });
});
