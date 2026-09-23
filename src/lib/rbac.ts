/**
 * Explicit permission matrix. Authorization is 100% server-side.
 * `own` scopes are further narrowed by tenant checks at the service layer.
 */
import { AppError, type AuthUser, type Role } from "@/lib/types";

export type Permission =
  // admin back office
  | "admin.access"
  | "agencies.manage"
  | "agencies.view"
  | "registrations.view"
  | "registrations.manage"
  | "users.manage"
  | "users.view"
  | "config.manage"
  | "config.view"
  | "cms.manage"
  | "audit.view"
  | "reports.view"
  // applications
  | "applications.view.all"
  | "applications.create"
  | "applications.review"
  | "applications.status.change"
  | "applications.submit.override"
  | "applications.assign"
  | "applications.pricing.adjust"
  // applicants
  | "applicants.view.all"
  // documents
  | "documents.view.all"
  | "documents.upload.own"
  | "documents.review"
  // wallet & billing
  | "wallet.view.all"
  | "wallet.view.own"
  | "wallet.adjust"
  | "transactions.view.all"
  | "transactions.view.own"
  // communications
  | "communications.view.all"
  | "communications.post.staff"
  | "communications.post.agency"
  // notifications
  | "notifications.staff"
  | "notifications.agency";

const PERMISSIONS: Record<Role, readonly Permission[]> = {
  SUPER_ADMIN: [
    "admin.access",
    "agencies.manage",
    "agencies.view",
    "registrations.view",
    "registrations.manage",
    "users.manage",
    "users.view",
    "config.manage",
    "config.view",
    "cms.manage",
    "audit.view",
    "reports.view",
    "applications.view.all",
    "applications.review",
    "applications.status.change",
    "applications.submit.override",
    "applications.assign",
    "applications.pricing.adjust",
    "applicants.view.all",
    "documents.view.all",
    "documents.review",
    "wallet.view.all",
    "wallet.adjust",
    "transactions.view.all",
    "communications.view.all",
    "communications.post.staff",
    "notifications.staff",
  ],
  ADMIN: [
    "admin.access",
    "agencies.manage",
    "agencies.view",
    "registrations.view",
    "registrations.manage",
    "users.manage",
    "users.view",
    "config.manage",
    "config.view",
    "cms.manage",
    "audit.view",
    "reports.view",
    "applications.view.all",
    "applications.review",
    "applications.status.change",
    "applications.submit.override",
    "applications.assign",
    "applications.pricing.adjust",
    "applicants.view.all",
    "documents.view.all",
    "documents.review",
    "wallet.view.all",
    "wallet.adjust",
    "transactions.view.all",
    "communications.view.all",
    "communications.post.staff",
    "notifications.staff",
  ],
  VISA_AGENT: [
    "admin.access",
    "agencies.manage",
    "agencies.view",
    "registrations.view",
    "registrations.manage",
    "users.view",
    "config.view",
    "reports.view",
    "applications.view.all",
    "applications.review",
    "applications.status.change",
    "applications.submit.override",
    "applications.assign",
    "applications.pricing.adjust",
    "applicants.view.all",
    "documents.view.all",
    "documents.review",
    "wallet.view.all",
    "transactions.view.all",
    "communications.view.all",
    "communications.post.staff",
    "notifications.staff",
  ],
  ACCOUNTING: [
    "admin.access",
    "agencies.manage",
    "agencies.view",
    "registrations.view",
    "registrations.manage",
    "users.view",
    "config.view",
    "reports.view",
    "applications.view.all",
    "applications.pricing.adjust",
    "applicants.view.all",
    "documents.view.all",
    "wallet.view.all",
    "wallet.adjust",
    "transactions.view.all",
    "communications.view.all",
    "notifications.staff",
  ],
  AGENCY_ADMIN: [
    "applications.create",
    "applications.review",
    "applicants.view.all",
    "documents.upload.own",
    "documents.view.all",
    "wallet.view.own",
    "transactions.view.own",
    "communications.post.agency",
    "notifications.agency",
    "users.manage",
  ],
  AGENCY_USER: [
    "applications.create",
    "applicants.view.all",
    "documents.upload.own",
    "documents.view.all",
    "wallet.view.own",
    "transactions.view.own",
    "communications.post.agency",
    "notifications.agency",
  ],
};

export function hasPermission(user: AuthUser, permission: Permission): boolean {
  return PERMISSIONS[user.role]?.includes(permission) ?? false;
}

/** Throw unless the user holds the permission. */
export function requirePermission(user: AuthUser, permission: Permission): void {
  if (!hasPermission(user, permission)) {
    throw new AppError("FORBIDDEN", "You are not authorized to perform this action.");
  }
}
