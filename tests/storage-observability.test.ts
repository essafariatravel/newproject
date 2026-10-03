import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete process.env.STORAGE_PROVIDER;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_STORAGE_BUCKET;
});

async function provider() {
  process.env.STORAGE_PROVIDER = "supabase";
  process.env.SUPABASE_URL = "https://storage-fixture.example.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = ["service", "fixture", "key"].join("-");
  process.env.SUPABASE_STORAGE_BUCKET = "test-bucket";
  const { storageProvider } = await import("../src/lib/storage");
  return storageProvider();
}

describe("storage observability", () => {
  it("distinguishes a missing object from a provider read failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
    await expect((await provider()).get("opaque/key")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 503 })));
    await expect((await provider()).get("opaque/key")).rejects.toMatchObject({
      code: "STORAGE_READ_FAILED",
    });
  });

  it("surfaces delete failures but treats already-missing objects as idempotent", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
    await expect((await provider()).delete("opaque/key")).resolves.toBeUndefined();

    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 500 })));
    await expect((await provider()).delete("opaque/key")).rejects.toMatchObject({
      code: "STORAGE_DELETE_FAILED",
    });
  });

  it("never emits the service-role credential in telemetry", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 503 })));

    await expect((await provider()).get("opaque/key")).rejects.toMatchObject({
      code: "STORAGE_READ_FAILED",
    });

    const line = String(errorLog.mock.calls.at(-1)?.[0] ?? "");
    expect(line).not.toContain(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "__missing__");
    expect(line).not.toContain("opaque/key");
  });
});
