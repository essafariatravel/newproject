import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixtures = vi.hoisted(() => ({
  ledger: ["synthetic-private-migration"],
  error: null as { code: string } | null,
  protectionStatus: "healthy",
  missingMigrations: [] as string[],
  connect: vi.fn(),
}));
vi.mock("pg", () => ({ Pool: class {
  async connect() {
    fixtures.connect();
    if (fixtures.error) throw fixtures.error;
    return {
      query: async (sql: string) => sql.includes("to_regclass")
        ? { rows: [{ present: true }] }
        : { rows: fixtures.ledger.map((name) => ({ name })) },
      release() {},
    };
  }
  async end() {}
} }));
vi.mock("@/lib/database-config", () => ({ databasePoolConfig: () => ({}) }));
vi.mock("@/lib/database-schema", () => ({ qualifiedTable: (name: string) => name }));
vi.mock("@/db/schema", () => ({}));
vi.mock("@/lib/release-protections", () => ({ checkReleaseProtections: async () => ({
  status: fixtures.protectionStatus,
  checkedAt: "2026-10-05T00:00:00.000Z",
  missing: { migrations: fixtures.missingMigrations, triggers: [], constraints: [], indexes: [] },
  apiLockdown: { anonSchemaUsage: false, authenticatedSchemaUsage: false, tableGrantCount: 0, routineGrantCount: 0 },
}) }));

import { GET } from "../src/app/api/internal/health/deep/route";

const token = "synthetic-test-operator-token-32-bytes-long";
const sha = "0fdbb3020112c8f96d4479cecb5c8bf3e98202ad";
function request(authorized = true) {
  return new Request("https://preview.example/api/internal/health/deep", {
    headers: authorized ? { authorization: `Bearer ${token}` } : {},
  });
}

beforeEach(() => {
  vi.stubEnv("HEALTHCHECK_TOKEN", token);
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("VERCEL_GIT_COMMIT_SHA", sha);
  fixtures.error = null;
  fixtures.protectionStatus = "healthy";
  fixtures.missingMigrations = [];
  fixtures.connect.mockClear();
});
afterEach(() => vi.unstubAllEnvs());

describe("protected deep health diagnostic minimization", () => {
  it("returns only operational health and aggregate schema/protection metrics", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      status: "healthy", service: "essafaria-visa-os", environment: "preview", releaseSha: sha,
      database: { connected: true, latencyMs: expect.any(Number), error: false },
      schema: { columnsValid: true, requiredTableCount: 5, presentTableCount: 5, migrationCount: 1 },
      releaseProtections: {
        status: "healthy", checkedAt: "2026-10-05T00:00:00.000Z",
        missingCounts: { migrations: 0, triggers: 0, constraints: 0, indexes: 0 },
        apiLockdown: { anonSchemaUsage: false, authenticatedSchemaUsage: false, tableGrantCount: 0, routineGrantCount: 0 },
      },
    });
  });

  it("reports missing protection counts without exposing identifiers", async () => {
    fixtures.protectionStatus = "degraded";
    fixtures.missingMigrations = ["synthetic-private-migration"];
    const response = await GET(request());
    const body = await response.json();
    expect(body.status).toBe("degraded");
    expect(body.releaseProtections).toMatchObject({ status: "degraded", missingCounts: { migrations: 1 } });
    expect(JSON.stringify(body)).not.toContain("synthetic-private-migration");
  });

  it("does not expose arbitrary error-code text", async () => {
    fixtures.error = { code: "synthetic-private-error-material" };
    const response = await GET(request());
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.database).toEqual({ connected: false, latencyMs: null, error: true });
    expect(JSON.stringify(body)).not.toContain("synthetic-private-error-material");
  });

  it("rejects missing authorization before touching diagnostics", async () => {
    const response = await GET(request(false));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ status: "unauthorized" });
    expect(fixtures.connect).not.toHaveBeenCalled();
  });

  it("stays disabled without the operator token", async () => {
    vi.stubEnv("HEALTHCHECK_TOKEN", undefined);
    const response = await GET(request());
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ status: "not_found" });
    expect(fixtures.connect).not.toHaveBeenCalled();
  });
});
