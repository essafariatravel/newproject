import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ namespace: 'synthetic"extension', enabled: true, failure: false, queries: [] as string[] }));
vi.mock("@/lib/db", () => ({ pool: { query: async (sql: string) => {
  fixture.queries.push(sql);
  if (sql.includes("from pg_stat_activity")) return { rows: [{ max_connections: 100, total_connections: 1, active_connections: 1, idle_connections: 0, active_waiting: 0, active_lock_waiting: 0, long_transactions: 0 }] };
  if (sql.includes("from pg_locks")) return { rows: [{ waiting_locks: 0 }] };
  if (sql.includes("from pg_stat_database")) return { rows: [{ deadlocks: 0, xact_rollback: 0, temp_files: 0, temp_bytes: 0, stats_reset: null }] };
  if (sql.includes("pg_database_size")) return { rows: [{ database_bytes: 100, schema_bytes: 50 }] };
  if (sql.includes("pg_extension")) return { rows: fixture.enabled ? [{ enabled: true, namespace: fixture.namespace }] : [] };
  if (fixture.failure || !sql.includes('from "synthetic""extension"."pg_stat_statements"')) throw { code: "42P01" };
  return { rows: [{ mean_over_500ms: 0, max_mean_exec_ms: 1, max_single_exec_ms: 2, application_mean_over_500ms: 0, application_max_mean_exec_ms: 1, application_max_single_exec_ms: 2 }] };
} } }));
vi.mock("@/lib/database-schema", () => ({ databaseSchema: () => "synthetic_application" }));
vi.mock("@/lib/observability", () => ({ logErrorOnce: vi.fn() }));

import { databaseObservabilitySnapshot } from "../src/lib/database-observability";
import { GET } from "../src/app/api/internal/health/database/route";

beforeEach(() => {
  fixture.enabled = true;
  fixture.failure = false;
  fixture.queries = [];
});

// This suite intentionally replaces the shared database modules. The Vitest
// run uses one module registry so the next real-database suite must not inherit
// these mocks, regardless of the deterministic file order.
afterAll(() => {
  vi.doUnmock("@/lib/db");
  vi.doUnmock("@/lib/database-schema");
  vi.doUnmock("@/lib/observability");
  vi.resetModules();
});

describe("database observability extension namespace", () => {
  it("reads the installed extension view outside the application search path with safe identifier quoting", async () => {
    const snapshot = await databaseObservabilitySnapshot();
    expect(snapshot.status).toBe("healthy");
    expect(snapshot.statements).toMatchObject({ pgStatStatementsEnabled: true, maxMeanExecMs: 1, applicationMaxSingleExecMs: 2 });
    expect(fixture.queries.some((sql) => sql.includes('from "synthetic""extension"."pg_stat_statements"'))).toBe(true);
    expect(JSON.stringify(snapshot)).not.toContain(fixture.namespace);
    expect(fixture.queries.every((sql) => /^\s*select\b/i.test(sql))).toBe(true);
  });

  it("retains null statement metrics when the extension is not installed", async () => {
    fixture.enabled = false;
    const snapshot = await databaseObservabilitySnapshot();
    expect(snapshot.status).toBe("healthy");
    expect(snapshot.statements).toMatchObject({ pgStatStatementsEnabled: false, maxMeanExecMs: null });
  });

  it("keeps a genuine statistics query failure unavailable", async () => {
    fixture.failure = true;
    const snapshot = await databaseObservabilitySnapshot();
    expect(snapshot).toMatchObject({ status: "unavailable", connections: null, transactions: null, storage: null, statements: null });
  });

  it("keeps authorized endpoint failures at HTTP 503 and rejects unauthenticated requests", async () => {
    vi.stubEnv("HEALTHCHECK_TOKEN", "synthetic-database-observer-token-32-bytes");
    fixture.failure = true;
    try {
      const denied = await GET(new Request("https://preview.example/api/internal/health/database"));
      expect(denied.status).toBe(401);
      expect(fixture.queries).toEqual([]);
      const allowed = await GET(new Request("https://preview.example/api/internal/health/database", {
        headers: { authorization: "Bearer synthetic-database-observer-token-32-bytes" },
      }));
      expect(allowed.status).toBe(503);
      expect(allowed.headers.get("cache-control")).toBe("no-store");
      expect((await allowed.json()).status).toBe("unavailable");
    } finally { vi.unstubAllEnvs(); }
  });
});
