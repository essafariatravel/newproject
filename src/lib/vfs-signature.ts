import { createHmac, timingSafeEqual } from "node:crypto";

export const MAX_VFS_INTAKE_BYTES = 3 * 1024 * 1024;
const SIGNATURE_WINDOW_MS = 180_000;

/** Stable UTF-8 HMAC input shared by Google Apps Script and local OCR worker. */
export function vfsSignaturePayload(timestamp: string, method: string, pathWithQuery: string, rawBody: Uint8Array): string {
  const bodyBase64 = Buffer.from(rawBody).toString("base64");
  return `${timestamp}\n${method.toUpperCase()}\n${pathWithQuery}\n${bodyBase64}`;
}

/** Constant-time authentication; reject stale, malformed and oversized messages. */
export function validateVfsWorkerSignature(input: {
  timestamp: string | null;
  signatureHex: string | null;
  method: string;
  pathWithQuery: string;
  body: Uint8Array;
  secret: string | undefined;
  now?: number;
}): boolean {
  const { timestamp, signatureHex, secret } = input;
  if (!timestamp || !/^\d{13}$/.test(timestamp) ||
      !signatureHex || !/^[0-9a-f]{64}$/i.test(signatureHex) ||
      !secret || secret.length < 40 ||
      input.body.length > MAX_VFS_INTAKE_BYTES) return false;
  const millis = Number(timestamp);
  if (Math.abs((input.now ?? Date.now()) - millis) > SIGNATURE_WINDOW_MS) return false;
  const expected = createHmac("sha256", secret)
    .update(vfsSignaturePayload(timestamp, input.method, input.pathWithQuery, input.body))
    .digest();
  return timingSafeEqual(expected, Buffer.from(signatureHex, "hex"));
}
