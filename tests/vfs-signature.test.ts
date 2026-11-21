import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  MAX_VFS_INTAKE_BYTES, validateVfsWorkerSignature, vfsSignaturePayload,
} from "@/lib/vfs-signature";

const secret = "test-only-signing-secret-at-least-forty-characters-long-0001";
const timestamp = "1795099000000";
const method = "POST", path = "/api/integrations/vfs-china/mail";
const body = new TextEncoder().encode('{"gmailMessageId":"test-msg-00001"}');
const signature = createHmac("sha256", secret)
  .update(vfsSignaturePayload(timestamp, method, path, body)).digest("hex");

describe("private VFS HMAC transport", () => {
  const valid = {
    timestamp, signatureHex: signature,
    method, pathWithQuery: path, body, secret, now: Number(timestamp),
  };

  it("accepts exact signed HTTP request within the time window", () => {
    expect(validateVfsWorkerSignature(valid)).toBe(true);
  });

  it("does not allow OCR worker to forge the mail URL or any different body", () => {
    expect(validateVfsWorkerSignature({ ...valid, pathWithQuery: "/api/integrations/vfs-china/ocr" })).toBe(false);
    expect(validateVfsWorkerSignature({ ...valid, body: new TextEncoder().encode("different") })).toBe(false);
    expect(validateVfsWorkerSignature({ ...valid, method: "GET" })).toBe(false);
    expect(validateVfsWorkerSignature({ ...valid, secret: "another-test-secret-of-sufficient-minimum-size-9999" })).toBe(false);
  });

  it("refuses expired and future timestamp replay attempts", () => {
    expect(validateVfsWorkerSignature({ ...valid, now: Number(timestamp) + 180_001 })).toBe(false);
    expect(validateVfsWorkerSignature({ ...valid, now: Number(timestamp) - 180_001 })).toBe(false);
  });

  it("rejects malformed signatures, weak secrets and an oversized upload", () => {
    expect(validateVfsWorkerSignature({ ...valid, signatureHex: "deadbeef" })).toBe(false);
    expect(validateVfsWorkerSignature({ ...valid, timestamp: "nonsense" })).toBe(false);
    expect(validateVfsWorkerSignature({ ...valid, secret: undefined })).toBe(false);
    expect(validateVfsWorkerSignature({ ...valid, secret: "weak" })).toBe(false);
    expect(validateVfsWorkerSignature({
      ...valid, body: new Uint8Array(MAX_VFS_INTAKE_BYTES + 1),
    })).toBe(false);
  });
});
