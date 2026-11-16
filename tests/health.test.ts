import { afterEach, describe, expect, it, vi } from "vitest";

import * as auth from "../src/lib/auth";
import { GET } from "../src/app/api/health/route";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("GET /api/health public response", () => {
  it.each([
    { caller: "anonymous", configuration: "valid", status: "healthy", code: 200 },
    { caller: "staff", configuration: "valid", status: "healthy", code: 200 },
    { caller: "anonymous", configuration: "missing", status: "unavailable", code: 503 },
    { caller: "staff", configuration: "missing", status: "unavailable", code: 503 },
    { caller: "anonymous", configuration: "invalid", status: "unavailable", code: 503 },
    { caller: "staff", configuration: "invalid", status: "unavailable", code: 503 },
  ])("returns only public health for $caller with $configuration configuration", async ({ caller, configuration, status, code }) => {
    // Simulate callers without creating sessions or accessing a fixture DB.
    vi.spyOn(auth, "getSessionUser").mockResolvedValue(caller === "staff" ? {
      id: "test-staff", email: "staff@test.example", name: "Test staff",
      role: "ADMIN", agencyId: null, userStatus: "ACTIVE",
      agencyStatus: null, agencyName: null, mustChangePassword: false,
    } : null);
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("DATABASE_SCHEMA", "public");
    // An unreachable local port proves valid configuration needs no live DB.
    vi.stubEnv("DATABASE_URL", configuration === "valid"
      ? "postgresql://postgres:example@127.0.0.1:1/essafaria"
      : configuration === "missing" ? undefined : "not-a-postgres-url");

    const response = await GET();
    expect(response.status).toBe(code);
    expect(response.headers.get("cache-control")).toBe("no-store");
    // Exact equality rejects any infrastructure, ledger, counts or config fields.
    expect(await response.json()).toEqual({ status, service: "essafaria-visa-os" });
  });
});
