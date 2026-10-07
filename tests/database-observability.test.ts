import { beforeAll, describe, expect, it, vi } from "vitest";
import { suiteSetup } from "./helpers/global-state";

// The namespace-contract suite uses isolate:false and deliberately mocks the
// database module. Remove those file-level doubles before this suite rebuilds
// its graph against the real disposable PostgreSQL instance.
vi.unmock("@/lib/db");
vi.unmock("@/lib/database-schema");
vi.unmock("@/lib/observability");

suiteSetup();

let databaseObservabilitySnapshot: typeof import("@/lib/database-observability")["databaseObservabilitySnapshot"];
let databaseHealthGET: typeof import("../src/app/api/internal/health/database/route")["GET"];

beforeAll(async () => {
  // Rebuild this suite's module graph after the namespace test's mock has
  // been removed; otherwise a test double can leak into the runtime health
  // proof and turn a full-suite run into a false failure.
  vi.resetModules();
  ({ databaseObservabilitySnapshot } = await import("@/lib/database-observability"));
  ({ GET: databaseHealthGET } = await import("../src/app/api/internal/health/database/route"));
});

describe("database observability", () => {
  it("returns a safe aggregate snapshot", async () => {
    const snapshot = await databaseObservabilitySnapshot();
    expect(["healthy", "degraded"]).toContain(snapshot.status);
    expect(snapshot.connections?.max).toBeGreaterThan(0);
    expect(snapshot.connections?.total).toBeGreaterThanOrEqual(1);
    expect(snapshot.transactions?.waitingLocks).toBeGreaterThanOrEqual(0);
    expect(snapshot.storage?.databaseBytes).toBeGreaterThan(0);
    expect(snapshot.storage?.schemaBytes).toBeGreaterThan(0);
    expect(typeof snapshot.statements?.pgStatStatementsEnabled).toBe("boolean");
    if (snapshot.statements?.pgStatStatementsEnabled) {
      expect(snapshot.statements.applicationMeanOver500ms).toBeGreaterThanOrEqual(0);
      expect(snapshot.statements.applicationMaxMeanExecMs).toBeGreaterThanOrEqual(0);
      expect(snapshot.statements.applicationMaxSingleExecMs).toBeGreaterThanOrEqual(0);
    } else {
      expect(snapshot.statements?.applicationMeanOver500ms).toBeNull();
      expect(snapshot.statements?.applicationMaxMeanExecMs).toBeNull();
      expect(snapshot.statements?.applicationMaxSingleExecMs).toBeNull();
    }

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
    process.env.HEALTHCHECK_TOKEN = "test-database-health-token-0123456789abcdef";
    try {
      const denied = await databaseHealthGET(
        new Request("http://localhost/api/internal/health/database", {
          headers: { authorization: "Bearer wrong-token" },
        }),
      );
      expect(denied.status).toBe(401);

      const allowed = await databaseHealthGET(
        new Request("http://localhost/api/internal/health/database", {
          headers: { authorization: "Bearer test-database-health-token-0123456789abcdef" },
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
