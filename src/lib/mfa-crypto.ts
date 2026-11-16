import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { verify } from "otplib";

function encryptionKey(value = process.env.MFA_ENCRYPTION_KEY): Buffer {
  const key = Buffer.from(value ?? "", "base64");
  if (key.length !== 32 || key.toString("base64") !== value) throw new Error("MFA encryption key is unavailable.");
  return key;
}

/** Standard AES-256-GCM; account binding prevents swapping encrypted secrets. */
export function encryptMfaSecret(secret: string, userId: string, key?: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(key), iv);
  cipher.setAAD(Buffer.from(`essafaria:mfa:v1:${userId}`));
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptMfaSecret(value: string, userId: string, key?: string): string {
  const [version, iv, tag, encrypted, extra] = value.split(".");
  if (version !== "v1" || !iv || !tag || !encrypted || extra) throw new Error("MFA secret is unavailable.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(key), Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(`essafaria:mfa:v1:${userId}`));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}

/** Store the matched epoch atomically with the authentication result to stop replay. */
export async function verifyMfaCode(secret: string, token: string, lastEpoch: number | null, epoch = Math.floor(Date.now() / 1000)): Promise<number | null> {
  if (!/^\d{6}$/.test(token)) return null;
  const result = await verify({ secret, token, epoch, epochTolerance: 30 });
  if (!result.valid || !("epoch" in result) || result.epoch === undefined) return null;
  return lastEpoch !== null && result.epoch <= lastEpoch ? null : result.epoch;
}
