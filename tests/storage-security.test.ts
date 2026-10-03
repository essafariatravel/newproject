import { afterEach, describe, expect, it, vi } from "vitest";
import { storageProvider } from "@/lib/storage";

const saved = {
  provider: process.env.STORAGE_PROVIDER,
  url: process.env.SUPABASE_URL,
  key: process.env.SUPABASE_SERVICE_ROLE_KEY,
  bucket: process.env.SUPABASE_STORAGE_BUCKET,
};

afterEach(() => {
  process.env.STORAGE_PROVIDER = saved.provider;
  process.env.SUPABASE_URL = saved.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = saved.key;
  process.env.SUPABASE_STORAGE_BUCKET = saved.bucket;
  vi.unstubAllGlobals();
});

describe("Supabase storage credential boundary", () => {
  it.each([
    "http://project.supabase.co",
    "https://evil.example",
    "https://project.supabase.co.evil.example",
    "https://user:pass@project.supabase.co",
    "https://project.supabase.co/path",
    "https://project.supabase.co?redirect=evil",
  ])("rejects unapproved storage URL %s before fetch", async (url) => {
    process.env.STORAGE_PROVIDER = "supabase";
    process.env.SUPABASE_URL = url;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(storageProvider().get("opaque-key")).rejects.toMatchObject({ code: "STORAGE_MISCONFIGURED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects bucket path injection before fetch", async () => {
    process.env.STORAGE_PROVIDER = "supabase";
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
    process.env.SUPABASE_STORAGE_BUCKET = "../other";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(storageProvider().get("opaque-key")).rejects.toMatchObject({ code: "STORAGE_MISCONFIGURED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
