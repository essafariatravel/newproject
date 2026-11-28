export const registrationFields = [
  "legalName", "city", "contactFirstName", "contactLastName", "email", "phoneCountry", "phone",
] as const;

export type RegistrationField = (typeof registrationFields)[number];
export type RegistrationDraft = Record<RegistrationField, string>;

export const DEFAULT_REGISTRATION_PHONE_COUNTRY = "DZ";
