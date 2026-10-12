import { AppError, isAgencyRole, isStaffRole, type AuthUser } from "@/lib/types";

/** ASCII login handles avoid confusable identities and staff-email ambiguity. */
export function normalizeAgencyUsername(value: string): string {
  const normalized = value.trim().normalize("NFKC").toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,47}$/.test(normalized)) {
    throw new AppError("VALIDATION", "Use 3–48 letters, digits, dots, hyphens or underscores for the username.");
  }
  return normalized;
}

/** Preserves every existing UUID and password without inventing a personal mailbox. */
export function legacyAgencyUsername(userId: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    throw new AppError("VALIDATION", "Invalid user identifier.");
  }
  return `agency_${userId.replaceAll("-", "").toLowerCase()}`;
}

export const SESSION_POLICIES = {
  staff: { idleMs: 30 * 60_000, absoluteMs: 12 * 60 * 60_000 },
  agency: { idleMs: 2 * 60 * 60_000, absoluteMs: 24 * 60 * 60_000 },
} as const;

export function sessionPolicy(agencyId: string | null) {
  return agencyId ? SESSION_POLICIES.agency : SESSION_POLICIES.staff;
}

export function assertAccountManager(actor: AuthUser, target?: { id: string; agencyId: string | null; role: string }): void {
  if (actor.role === "SUPER_ADMIN" && !actor.agencyId) return;
  if (actor.role === "AGENCY_ADMIN" && actor.agencyId) {
    if (!target || (target.agencyId === actor.agencyId && target.role === "AGENCY_USER" && target.id !== actor.id)) return;
    throw new AppError("NOT_FOUND", "User not found.");
  }
  throw new AppError("FORBIDDEN", "Only SUPER_ADMIN can manage staff accounts.");
}

export function assertAccountRole(actor: AuthUser, targetAgencyId: string | null, role: string): void {
  assertAccountManager(actor);
  if (actor.role === "AGENCY_ADMIN" && role !== "AGENCY_USER") {
    throw new AppError("FORBIDDEN", "Agency administrators can only create AGENCY_USER accounts.");
  }
  if (targetAgencyId ? !isAgencyRole(role) : !isStaffRole(role)) {
    throw new AppError("VALIDATION", "Keep staff and agency account roles in their own workspace.");
  }
}
