import { vi } from "vitest";

/** Runs before any test-file imports — pins the test environment. */
process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5434/essafaria_test";
process.env.STORAGE_PROVIDER = "db";
// NODE_ENV stays as-is (vitest manages it)
process.env.SEED_ADMIN_PASSWORD = "Test-Admin-123";
process.env.SEED_AGENCY_PASSWORD = "Test-Agency-123";

// Shared request mock must load before the shared auth module registry.
vi.mock("next/headers", async () => {
  const { request } = await import("./request");
  return {
    cookies: async () => ({
      get: () => request.cookie ? { value: request.cookie } : undefined,
      set: (name: string, value: string, options: unknown) => {
        request.cookie = value;
        request.set(name, value, options);
      },
      delete: () => { request.cookie = ""; },
    }),
    headers: async () => new Headers({ "user-agent": "isolated-login-test" }),
  };
});
