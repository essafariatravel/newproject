import { createHash } from "node:crypto";

const SHA256_HEX = /^[0-9a-f]{64}$/;

export function sha256Hex(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

export function assertStoredFileIntegrity(input: {
  data: Uint8Array;
  expectedSizeBytes: number;
  expectedSha256?: string | null;
}): void {
  if (!Number.isSafeInteger(input.expectedSizeBytes) || input.expectedSizeBytes < 0) {
    throw new Error("Stored file integrity metadata is invalid.");
  }
  if (input.data.byteLength !== input.expectedSizeBytes) {
    throw new Error("Stored file integrity check failed.");
  }
  if (input.expectedSha256 == null || input.expectedSha256 === "") return;
  const expected = input.expectedSha256.toLowerCase();
  if (!SHA256_HEX.test(expected) || sha256Hex(input.data) !== expected) {
    throw new Error("Stored file integrity check failed.");
  }
}
