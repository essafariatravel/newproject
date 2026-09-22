/** Shared domain types and constants. */

export const STAFF_ROLES = ["SUPER_ADMIN", "ADMIN", "VISA_AGENT", "ACCOUNTING"] as const;
export const AGENCY_ROLES = ["AGENCY_ADMIN", "AGENCY_USER"] as const;
export const ALL_ROLES = [...STAFF_ROLES, ...AGENCY_ROLES] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];
export type AgencyRole = (typeof AGENCY_ROLES)[number];
export type Role = StaffRole | AgencyRole;

export function isStaffRole(role: string): role is StaffRole {
  return (STAFF_ROLES as readonly string[]).includes(role);
}

export function isAgencyRole(role: string): role is AgencyRole {
  return (AGENCY_ROLES as readonly string[]).includes(role);
}

/** Roles allowed to change application status (staff-side workflow roles). */
export const STATUS_CHANGE_ROLES: readonly string[] = ["SUPER_ADMIN", "ADMIN", "VISA_AGENT"];
/** Roles allowed to manage the wallet (credit / debit). */
export const WALLET_MANAGE_ROLES: readonly string[] = ["SUPER_ADMIN", "ADMIN", "ACCOUNTING"];
/** Roles allowed to review documents. */
export const DOCUMENT_REVIEW_ROLES: readonly string[] = ["SUPER_ADMIN", "ADMIN", "VISA_AGENT"];
/** Roles allowed to submit with gate override. */
export const OVERRIDE_ROLES: readonly string[] = ["SUPER_ADMIN", "ADMIN", "VISA_AGENT"];
/** Roles authorized to decide (approve / reject / review) agency registrations. */
export const REGISTRATION_DECIDE_ROLES: readonly string[] = ["SUPER_ADMIN", "ADMIN"];

export const DOCUMENT_STATUSES = [
  "UPLOADED",
  "UNDER_REVIEW",
  "ACCEPTED",
  "REJECTED",
  "RESUBMISSION_REQUIRED",
] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const GENDERS = ["MALE", "FEMALE", "OTHER"] as const;
export type Gender = (typeof GENDERS)[number];

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

/** MIME types accepted for visa documents. */
export const ALLOWED_MIME_TYPES: readonly string[] = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

/**
 * MIME types accepted for agency-registration company documents (KYC).
 * Stricter than visa documents: PDF and images only, verified by magic bytes.
 */
export const REGISTRATION_MIME_TYPES: readonly string[] = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];
export const REGISTRATION_MAX_UPLOAD_BYTES = MAX_UPLOAD_BYTES; // 10 MB
export const REGISTRATION_MAX_DOCUMENTS = 4;

export const SESSION_COOKIE = "evos_session";
export const SESSION_TTL_DAYS = 7;

/** Authenticated user resolved server-side on every request. */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  agencyId: string | null;
  userStatus: string;
  agencyStatus: string | null;
  agencyName: string | null;
  /** Phase 2.2 §11 — when true, only the password-change screen is reachable. */
  mustChangePassword?: boolean;
}

/** Error carrying a user-safe message; never leaks internals. */
export class AppError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}
