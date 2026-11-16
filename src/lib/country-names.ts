/**
 * §53 — country names must follow the interface language.
 *
 * Config-first: when the catalogue carries an explicit localized name it wins.
 * Otherwise the ISO-3166 code is resolved through the platform ICU data so a
 * French or Arabic screen never falls back to English-only copy. Historical
 * snapshots (applications.country_name) are never rewritten — the display
 * helper only affects how a live catalogue row is presented.
 */
export type UiLocale = "en" | "fr" | "ar";

export function localeTag(locale: UiLocale): string {
  return locale === "fr" ? "fr-FR" : locale === "ar" ? "ar-DZ" : "en-GB";
}

const displayCache = new Map<string, Intl.DisplayNames | null>();

function displayNames(locale: UiLocale): Intl.DisplayNames | null {
  const tag = localeTag(locale);
  if (displayCache.has(tag)) return displayCache.get(tag) ?? null;
  let created: Intl.DisplayNames | null = null;
  try {
    created = new Intl.DisplayNames([tag], { type: "region" });
  } catch {
    created = null;
  }
  displayCache.set(tag, created);
  return created;
}

export interface CountryLike {
  name: string;
  iso2?: string | null;
  nameFr?: string | null;
  nameAr?: string | null;
}

/** Localized country label with a graceful fallback chain. */
export function countryName(country: CountryLike, locale: UiLocale = "en"): string {
  const override = locale === "fr" ? country.nameFr : locale === "ar" ? country.nameAr : null;
  if (override && override.trim() !== "") return override;
  if (locale !== "en" && country.iso2) {
    const dn = displayNames(locale);
    const resolved = dn?.of(country.iso2.toUpperCase());
    if (resolved && resolved !== country.iso2.toUpperCase()) return resolved;
  }
  return country.name;
}
