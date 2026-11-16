/**
 * Agency-registration domain constants.
 *
 * Lives in a dependency-free module so BOTH the server (schema, services)
 * and client components (registration form) can import it without pulling
 * the database layer into the browser bundle.
 */

export const REGISTRATION_STATUSES = [
  "PENDING",
  "UNDER_REVIEW",
  "MORE_INFORMATION_REQUIRED",
  "APPROVED",
  "REJECTED",
] as const;
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

export const REGISTRATION_BUSINESS_TYPES = [
  "TRAVEL_AGENCY",
  "TOUR_OPERATOR",
  "VISA_AGENCY",
  "CORPORATE_TRAVEL",
  "WHOLESALER",
  "OTHER",
] as const;
export type RegistrationBusinessType = (typeof REGISTRATION_BUSINESS_TYPES)[number];

export const REGISTRATION_DOCUMENT_CATEGORIES = [
  "COMMERCIAL_REGISTRATION",
  "AGENCY_LICENCE",
  "TAX_DOCUMENT",
  "OTHER",
] as const;
export type RegistrationDocumentCategory = (typeof REGISTRATION_DOCUMENT_CATEGORIES)[number];

export const MONTHLY_VOLUMES = ["1-10", "11-50", "51-200", "200+"] as const;
export type MonthlyVolume = (typeof MONTHLY_VOLUMES)[number];
