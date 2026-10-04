import { describe, expect, it } from "vitest";
import { readRequestBodyLimited } from "@/lib/http-body";

describe("bounded HTTP request bodies", () => {
  it("accepts a body at the exact limit", async () => {
    const request = new Request("https://local.invalid/api", { method: "POST", body: "1234567890" });
    await expect(readRequestBodyLimited(request, 10)).resolves.toEqual(Buffer.from("1234567890"));
  });

  it("rejects an oversized streamed body even without trusting Content-Length", async () => {
    const request = new Request("https://local.invalid/api", { method: "POST", body: "12345678901" });
    request.headers.delete("content-length");
    await expect(readRequestBodyLimited(request, 10)).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });
  });

  it("rejects invalid limits", async () => {
    const request = new Request("https://local.invalid/api", { method: "POST", body: "x" });
    await expect(readRequestBodyLimited(request, 0)).rejects.toThrow(/positive safe integer/i);
  });
});
