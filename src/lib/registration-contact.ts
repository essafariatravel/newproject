import { Metadata, getCountries, getCountryCallingCode, parsePhoneNumberFromString } from "libphonenumber-js/core";
import type { CountryCode, MetadataJson } from "libphonenumber-js/core";
import phoneMetadata from "libphonenumber-js/metadata.max.json";
import { z } from "zod";
import type { RegistrationDraft, RegistrationField } from "./registration-draft";
export const REGISTRATION_PHONE_DIGITS = 9;
const metadata: MetadataJson = phoneMetadata;
const numbering = new Metadata(metadata);
export const registrationPhoneCountries = getCountries(metadata).flatMap(country => {
  numbering.selectNumberingPlan(country);
  return numbering.numberingPlan?.possibleLengths().includes(REGISTRATION_PHONE_DIGITS)
    ? [{ country, code: `+${getCountryCallingCode(country, metadata)}` }]
    : [];
});
const callingCodes = new Map(registrationPhoneCountries.map(({ country, code }) => [country, code]));

export function registrationCallingCode(country: string) {
  return callingCodes.get(country as CountryCode);
}

const emailSchema = z.email();

export function normalizeRegistrationEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isRegistrationEmail(value: string) {
  const normalized = normalizeRegistrationEmail(value);
  const localPart = normalized.split("@", 1)[0] ?? "";
  return normalized.length <= 160 && localPart.length <= 64 && emailSchema.safeParse(normalized).success;
}

const domainSuggestions = new Map([
  ["gmai.com", "gmail.com"], ["gmial.com", "gmail.com"], ["gmail.con", "gmail.com"],
  ["hotnail.com", "hotmail.com"], ["hotmail.con", "hotmail.com"],
  ["outlok.com", "outlook.com"], ["outlook.con", "outlook.com"],
  ["yaho.com", "yahoo.com"], ["yahoo.con", "yahoo.com"],
]);

export function suggestRegistrationEmail(value: string) {
  const normalized = normalizeRegistrationEmail(value);
  const at = normalized.lastIndexOf("@");
  const domain = domainSuggestions.get(normalized.slice(at + 1));
  if (at <= 0 || !domain) return undefined;
  const suggestion = normalized.slice(0, at + 1) + domain;
  return isRegistrationEmail(suggestion) ? suggestion : undefined;
}

export function registrationPhoneDigits(value: string) {
  return value.normalize("NFKC").replace(/[\u0660-\u0669\u06F0-\u06F9]/g, digit =>
    String(digit.charCodeAt(0) - (digit.charCodeAt(0) < 0x6f0 ? 0x660 : 0x6f0)),
  );
}

type ValidPhone = { status: "valid"; country: CountryCode; national: string; e164: string };
type PhoneAssessment = ValidPhone | { status: "empty" | "country" | "length" | "invalid" };
const phoneProblems = { empty: "required", length: "phoneLength", invalid: "invalidPhone" } as const;

export function assessRegistrationPhone(value: string, selected: string): PhoneAssessment {
  if (!value.trim()) return { status: "empty" };
  const compact = registrationPhoneDigits(value).replace(/[\s().-]/g, "").replace(/^00/, "+");
  if (value.length > 40 || !/^\+?\d+$/.test(compact)) return { status: "invalid" };

  const international = compact.startsWith("+");
  if (!international && !registrationCallingCode(selected)) return { status: "country" };
  // An ordinary domestic trunk prefix may arrive with a pasted number.
  const hasTrunk = !international && compact.length === REGISTRATION_PHONE_DIGITS + 1 && compact.startsWith("0");
  if (!international && !hasTrunk && compact.length !== REGISTRATION_PHONE_DIGITS) return { status: "length" };
  const parsed = parsePhoneNumberFromString(compact, { defaultCountry: selected as CountryCode, extract: false }, metadata);
  if (!parsed) return { status: "invalid" };
  if (parsed.nationalNumber.length !== REGISTRATION_PHONE_DIGITS) return { status: "length" };
  if (!parsed.country || !registrationCallingCode(parsed.country)) return { status: "country" };
  if (!international && parsed.country !== selected) return { status: "country" };
  if (!parsed.isValid()) return { status: "invalid" };
  return { status: "valid", country: parsed.country, national: parsed.nationalNumber, e164: parsed.number };
}

export type RegistrationProblem = "required" | "tooShort" | "tooLong" | "invalidEmail" | "phoneCountry" | "phoneLength" | "invalidPhone";
export type RegistrationProblems = Partial<Record<RegistrationField, RegistrationProblem>>;

export function registrationProblems(draft: RegistrationDraft, phone = assessRegistrationPhone(draft.phone, draft.phoneCountry)): RegistrationProblems {
  const errors: RegistrationProblems = {};
  const names = [["legalName", 160, 2], ["contactFirstName", 160, 2], ["contactLastName", 80, 1]] as const;
  for (const [field, max, min] of names) {
    const length = draft[field].trim().length;
    if (!length) errors[field] = "required";
    else if (length < min) errors[field] = "tooShort";
    else if (length > max) errors[field] = "tooLong";
  }
  if (draft.city.trim().length > 80) errors.city = "tooLong";
  if (!draft.email.trim()) errors.email = "required";
  else if (!isRegistrationEmail(draft.email)) errors.email = "invalidEmail";

  if (phone.status === "country" || (phone.status === "valid" && phone.country !== draft.phoneCountry)) {
    errors.phoneCountry = "phoneCountry";
  } else if (phone.status !== "valid") {
    errors.phone = phoneProblems[phone.status];
  }
  return errors;
}
