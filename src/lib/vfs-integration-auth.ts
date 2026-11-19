import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/db/schema";
import type { AuthUser } from "@/lib/types";
import { AppError } from "@/lib/types";

const DEFAULT_WINDOW_MS = 180_000;
export const MAX_VFS_INTAKE_BYTES = 3 * 1024 * 1024;

export function vfsIntegrationEnabled(): boolean {
  return process.env.VFS_CHINA_INTEGRATION_ENABLED === "true";
}

export function vfsOcrWorkerEnabled(): boolean {
  return vfsIntegrationEnabled() && process.env.VFS_CHINA_OCR_ENABLED === "true";
}

export function vfsMailDecisionEnabled(): boolean {
  return vfsIntegrationEnabled() && process.env.VFS_CHINA_AUTO_DECISION_ENABLED === "true";
}

/** Canonical message used by both Google Apps Script and the local OCR worker. */
export function vfsSignaturePayload(timestamp: string, method: string, pathWithQuery: string, rawBody: Uint8Array): string {
  const bodyHex = Buffer.from(rawBody).toString("base64");
  return `${timestamp}\n${method.toUpperCase()}\n${pathWithQuery}\n${bodyHex}`;
}

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
  if (!timestamp || !/^\d{13}$/.test(timestamp) || !signatureHex || !/^[0-9a-f]{64}$/i.test(signatureHex) ||
      !secret || secret.length < 40 || input.body.length > MAX_VFS_INTAKE_BYTES) return false;
  const ts = Number(timestamp);
  if (Math.abs((input.now ?? Date.now()) - ts) > DEFAULT_WINDOW_MS) return false;
  const expected = createHmac("sha256", secret)
    .update(vfsSignaturePayload(timestamp, input.method, input.pathWithQuery, input.body))
    .digest();
  return timingSafeEqual(expected, Buffer.from(signatureHex, "hex"));
}

export function requireSignedVfsRequest(request: Request, body: Uint8Array): void {
  if (!vfsIntegrationEnabled()) throw new AppError("NOT_ENABLED", "VFS automation is not active.");
  const url = new URL(request.url);
  if (!validateVfsWorkerSignature({
    timestamp: request.headers.get("x-vfs-timestamp"),
    signatureHex: request.headers.get("x-vfs-signature"),
    method: request.method,
    pathWithQuery: url.pathname + url.search,
    body,
    secret: process.env.VFS_CHINA_HMAC_SECRET,
  })) {
    throw new AppError("UNAUTHENTICATED", "Invalid integration authentication.");
  }
}

/**
 * Dedicated staff service principal, NOT an agency or anonymous app visitor.
 * Never accept a user ID, agency or role from an ingestion payload.
 * Requires an administrator-provisioned inactive-login service identity.
 */
export async function vfsServiceActor(): Promise<AuthUser> {
  const id = process.env.VFS_CHINA_SERVICE_ACTOR_ID;
  if (!id || !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id))
    throw new AppError("NOT_CONFIGURED", "Dedicated VFS service account is not configured.");
  const [staff] = await db.select({
    id: users.id, email: users.email, name: users.name, role: users.role,
    agencyId: users.agencyId, status: users.status, activationPending: users.activationPending,
    mustChangePassword: users.mustChangePassword, credentialVersion: users.credentialVersion,
    username: users.username,
  }).from(users).where(eq(users.id, id)).limit(1);
  if (!staff || staff.role !== "VISA_AGENT" || staff.agencyId ||
      staff.status !== "ACTIVE" || staff.activationPending || staff.mustChangePassword)
    throw new AppError("NOT_CONFIGURED", "VFS service identity is not eligible.");
  return {
    id: staff.id, email: staff.email, name: staff.name,
    username: staff.username, role: "VISA_AGENT", agencyId: null,
    userStatus: "ACTIVE", agencyStatus: null, agencyName: null,
    credentialVersion: staff.credentialVersion, mustChangePassword: false,
  };
}
