import { describe, expect, it } from "vitest";
import { generate, generateSecret } from "otplib";
import { decryptMfaSecret, encryptMfaSecret, verifyMfaCode } from "@/lib/mfa-crypto";

describe("MFA secret protection and standards based verification", () => {
  const key = Buffer.alloc(32, 17).toString("base64");
  it("encrypts with fresh nonces and binds ciphertext to its account", () => {
    const secret = generateSecret();
    const first = encryptMfaSecret(secret, "account-a", key);
    expect(first).not.toContain(secret);
    expect(encryptMfaSecret(secret, "account-a", key)).not.toBe(first);
    expect(decryptMfaSecret(first, "account-a", key)).toBe(secret);
    expect(() => decryptMfaSecret(first, "account-b", key)).toThrow();
    expect(() => decryptMfaSecret(first, "account-a", Buffer.alloc(32, 18).toString("base64"))).toThrow();
    expect(() => encryptMfaSecret(secret, "account-a", "weak")).toThrow();
  });
  it("rejects replay, expired and malformed OTP values", async () => {
    const secret = generateSecret();
    const epoch = 1_800_000_000;
    const code = await generate({ secret, epoch });
    expect(await verifyMfaCode(secret, code, null, epoch)).toBe(epoch);
    expect(await verifyMfaCode(secret, code, epoch, epoch)).toBeNull();
    expect(await verifyMfaCode(secret, code, null, epoch + 120)).toBeNull();
    expect(await verifyMfaCode(secret, "<script>", null, epoch)).toBeNull();
  });
});
