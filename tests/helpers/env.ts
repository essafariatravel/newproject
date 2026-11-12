import { vi } from "vitest";

/** Runs before any test-file imports — pins the test environment. */
process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5434/essafaria_test";
process.env.STORAGE_PROVIDER = "db";
process.env.DATABASE_SCHEMA = "public";
process.env.TURNSTILE_MODE = "off";
process.env.AUTH_LOGIN_COUNTER_SECRET = Buffer.alloc(32, 21).toString("base64url");
// NODE_ENV stays as-is (vitest manages it)

// Keep Next cache invalidation inert in every suite before shared action modules load.
// Per-file mocks are too late when `isolate: false` has already cached next/cache.
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

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
    headers: async () => new Headers(request.headers),
  };
});
