export const UI_LOCALES = ["en", "fr", "ar"] as const;
export type UiLocale = (typeof UI_LOCALES)[number];
export const UI_LOCALE_COOKIE = "evos_ui_locale";
export const DEFAULT_UI_LOCALE: UiLocale = "en";

export const UI_LOCALE_NAMES: Record<UiLocale, string> = {
  en: "English",
  fr: "Français",
  ar: "العربية",
};

/** Normalise any raw value to a supported interface locale (or null). */
export function pickUiLocale(value: unknown): UiLocale | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return (UI_LOCALES as readonly string[]).includes(normalized) ? (normalized as UiLocale) : null;
}
