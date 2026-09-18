import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb);
const KEY_LENGTH = 64;

/** Hash a password with scrypt. Format: scrypt$<saltHex>$<hashHex> */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

/** Verify a password against a stored hash. Constant-time comparison. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1]!, "hex");
  const expected = Buffer.from(parts[2]!, "hex");
  const derived = (await scrypt(password, salt, expected.length)) as Buffer;
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/** Cryptographically strong opaque session token. */
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Only the SHA-256 of the token is persisted. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
