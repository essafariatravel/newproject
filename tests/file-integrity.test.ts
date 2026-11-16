import { describe, expect, it } from "vitest";
import { assertStoredFileIntegrity, sha256Hex } from "@/lib/file-integrity";

describe("stored-file integrity", () => {
  it("computes stable SHA-256 fingerprints", () => {
    expect(sha256Hex(Buffer.from("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("accepts matching size/hash and keeps legacy size-only rows compatible", () => {
    const data = Buffer.from("passport bytes");
    expect(() => assertStoredFileIntegrity({ data, expectedSizeBytes: data.length, expectedSha256: sha256Hex(data) })).not.toThrow();
    expect(() => assertStoredFileIntegrity({ data, expectedSizeBytes: data.length, expectedSha256: null })).not.toThrow();
  });

  it("rejects truncation and same-size tampering", () => {
    const data = Buffer.from("original");
    const hash = sha256Hex(data);
    expect(() => assertStoredFileIntegrity({ data: data.subarray(0, data.length - 1), expectedSizeBytes: data.length, expectedSha256: hash })).toThrow(/integrity/i);
    expect(() => assertStoredFileIntegrity({ data: Buffer.from("tampered"), expectedSizeBytes: data.length, expectedSha256: hash })).toThrow(/integrity/i);
  });
});
