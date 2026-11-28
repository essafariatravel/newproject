import { Metadata, getCountries, getCountryCallingCode, parsePhoneNumberFromString } from "libphonenumber-js/core";
import type { CountryCode, MetadataJson } from "libphonenumber-js/core";
import phoneMetadata from "libphonenumber-js/metadata.max.json";
import type { RegistrationCopy, RegistrationLocale } from "./i18n";

export const DEFAULT_PHONE_COUNTRY = "DZ";
export const contactFields = ["contactFirstName", "contactLastName", "phoneCountry", "phone"] as const;
export type ContactField = (typeof contactFields)[number];
export type ContactDraft = Record<ContactField, string>;
const NATIONAL_DIGITS = 9;
const metadata: MetadataJson = phoneMetadata;
const numbering = new Metadata(metadata);
const phoneCountries = getCountries(metadata).flatMap(country => {
  numbering.selectNumberingPlan(country);
  return numbering.numberingPlan?.possibleLengths().includes(NATIONAL_DIGITS)
    ? [{ country, code: "+".concat(getCountryCallingCode(country, metadata)) }]
    : [];
});
const supportedCountries = new Set<string>(phoneCountries.map(option => option.country));

export function registrationPhoneOptions(locale: RegistrationLocale) {
  const names = new Intl.DisplayNames([locale], { type: "region" });
  const order = new Intl.Collator(locale);
  return phoneCountries.map(option => ({ ...option, name: names.of(option.country) ?? option.country }))
    .sort((a, b) => {
      if (a.country === DEFAULT_PHONE_COUNTRY) return -1;
      if (b.country === DEFAULT_PHONE_COUNTRY) return 1;
      return order.compare(a.name, b.name);
    });
}

function compactPhone(value: string) {
  return value.normalize("NFKC")
    .replace(/[\u0660-\u0669\u06F0-\u06F9]/g, digit =>
      String(digit.charCodeAt(0) - (digit.charCodeAt(0) < 0x6f0 ? 0x660 : 0x6f0)),
    )
    .replace(/[\s().-]/g, "");
}

type ValidPhone = { status: "valid"; country: CountryCode; national: string; e164: string };
type PhoneAssessment = ValidPhone | { status: "empty" | "country" | "length" | "invalid" };

export function assessRegistrationPhone(value: string, selected: string): PhoneAssessment {
  if (!value.trim()) return { status: "empty" };
  const compact = compactPhone(value).replace(/^00/, "+");
  if (value.length > 40 || !/^\+?\d+$/.test(compact)) return { status: "invalid" };
  const international = compact.startsWith("+");
  if (!international && !supportedCountries.has(selected)) return { status: "country" };
  // The domestic prefix may be present when typing or pasting a number.
  const hasTrunk = !international && compact.length === NATIONAL_DIGITS + 1 && compact.startsWith("0");
  if (!international && !hasTrunk && compact.length !== NATIONAL_DIGITS) return { status: "length" };
  const parsed = parsePhoneNumberFromString(compact, { defaultCountry: selected as CountryCode, extract: false }, metadata);
  if (!parsed) return { status: "invalid" };
  if (parsed.nationalNumber.length !== NATIONAL_DIGITS) return { status: "length" };
  if (!parsed.country || !supportedCountries.has(parsed.country)) return { status: "country" };
  if (!international && parsed.country !== selected) return { status: "country" };
  if (!parsed.isValid()) return { status: "invalid" };
  return { status: "valid", country: parsed.country, national: parsed.nationalNumber, e164: parsed.number };
}

export function registrationPhoneEntry(value: string, country: string) {
  const digits = compactPhone(value);
  if (digits.length <= NATIONAL_DIGITS && /^\d*$/.test(digits)) return { country, national: digits };
  const complete = assessRegistrationPhone(value, country);
  if (complete.status === "valid") return { country: complete.country, national: complete.national };
}

export function normalizeRegistrationName(value: string) {
  return value.normalize("NFC").trim().replace(/[ \u00a0\u202f]+/g, " ");
}

const personName = /^\p{L}[\p{L}\p{M}]*(?:[ '’‐‑-]\p{L}[\p{L}\p{M}]*)*$/u;

export function hasInvalidRegistrationNameCharacters(value: string) {
  return /[^\p{L}\p{M} '’‐‑-]/u.test(normalizeRegistrationName(value));
}

type ContactProblem = "required" | "tooShort" | "tooLong" | "invalidName" | "phoneCountry" | "phoneLength" | "invalidPhone";
const phoneProblems = { empty: "required", length: "phoneLength", invalid: "invalidPhone" } as const;

export function registrationContactProblems(draft: ContactDraft, phone = assessRegistrationPhone(draft.phone, draft.phoneCountry)) {
  const issues: Partial<Record<ContactField, ContactProblem>> = {};
  const names = [["contactFirstName", 2, 160], ["contactLastName", 1, 80]] as const;
  for (const [field, minimum, maximum] of names) {
    const value = normalizeRegistrationName(draft[field]);
    if (!value) issues[field] = "required";
    else if (value.length > maximum) issues[field] = "tooLong";
    else if (!personName.test(value)) issues[field] = "invalidName";
    else if (value.length < minimum) issues[field] = "tooShort";
  }
  if (phone.status === "country" || (phone.status === "valid" && phone.country !== draft.phoneCountry)) {
    issues.phoneCountry = "phoneCountry";
  } else if (phone.status !== "valid") {
    issues.phone = phoneProblems[phone.status];
  }
  return issues;
}

export const registrationContactText = {
  fr: {
    contactFirstName: "Prénom", contactLastName: "Nom de famille", phoneCountryLabel: "Indicatif",
    invalidName: "Utilisez des lettres pour ce nom.", phoneCountry: "Choisissez l’indicatif du numéro saisi.",
    phoneLength: "Vérifiez le numéro de téléphone.", invalidPhone: "Ce numéro ne correspond pas à l’indicatif sélectionné.",
  },
  en: {
    contactFirstName: "Given name", contactLastName: "Family name", phoneCountryLabel: "Country code",
    invalidName: "Use letters for this name.", phoneCountry: "Choose the country code for this number.",
    phoneLength: "Check the phone number.", invalidPhone: "This number does not match the selected country code.",
  },
  ar: {
    contactFirstName: "الاسم الشخصي", contactLastName: "اسم العائلة", phoneCountryLabel: "رمز الدولة",
    invalidName: "يرجى كتابة الاسم بالحروف.", phoneCountry: "اختاروا رمز الدولة المطابق لهذا الرقم.",
    phoneLength: "تحقّقوا من رقم الهاتف.", invalidPhone: "هذا الرقم لا يطابق رمز الدولة المختار.",
  },
} as const;

export function registrationContactError(locale: RegistrationLocale, errors: RegistrationCopy["errors"], problem: ContactProblem) {
  if (problem === "required" || problem === "tooShort" || problem === "tooLong") return errors[problem];
  return registrationContactText[locale][problem];
}
