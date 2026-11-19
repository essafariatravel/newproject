import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/db/schema";
import type { AuthUser } from "@/lib/types";
import { AppError } from "@/lib/types";

import { validateVfsWorkerSignature } from "@/lib/vfs-signature";
export { MAX_VFS_INTAKE_BYTES } from "@/lib/vfs-signature";

export function vfsIntegrationEnabled(): boolean {
  return process.env.VFS_CHINA_INTEGRATION_ENABLED === "true";
}

export function vfsOcrWorkerEnabled(): boolean {
  return vfsIntegrationEnabled() && process.env.VFS_CHINA_OCR_ENABLED === "true";
}

export function vfsMailDecisionEnabled(): boolean {
  return vfsIntegrationEnabled() && process.env.VFS_CHINA_AUTO_DECISION_ENABLED === "true";
}

export function requireSignedVfsRequest(request: Request, body: Uint8Array, channel: "mail" | "ocr"): void {
  if (!vfsIntegrationEnabled()) throw new AppError("NOT_ENABLED", "VFS automation is not active.");
  const url = new URL(request.url);
  if (!validateVfsWorkerSignature({
    timestamp: request.headers.get("x-vfs-timestamp"),
    signatureHex: request.headers.get("x-vfs-signature"),
    method: request.method,
    pathWithQuery: url.pathname + url.search,
    body,
    // Independent credentials: an OCR workstation can NEVER impersonate a
    // Gmail certificate decision, even if its own signing key is compromised.
    secret: channel === "mail"
      ? process.env.VFS_CHINA_MAIL_HMAC_SECRET
      : process.env.VFS_CHINA_OCR_HMAC_SECRET,
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
