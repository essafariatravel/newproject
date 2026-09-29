import type { UiLocale } from "@/lib/ui-i18n";

export interface LocalizedConfig {
  name: string;
  nameFr?: string | null;
  nameAr?: string | null;
  description?: string | null;
  descriptionFr?: string | null;
  descriptionAr?: string | null;
}

/** Configured translations only; never machine-translate staff content. */
export function configName(row: LocalizedConfig, locale: UiLocale): string {
  return (locale === "fr" ? row.nameFr : locale === "ar" ? row.nameAr : row.name)?.trim() || row.name;
}

export function configDescription(row: LocalizedConfig, locale: UiLocale): string {
  return (locale === "fr" ? row.descriptionFr : locale === "ar" ? row.descriptionAr : row.description)?.trim() || row.description || "";
}

/** Search every configured language so changing the UI language does not hide a match. */
export function configMatches(row: LocalizedConfig & { code?: string }, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  return !needle || [row.code, row.name, row.nameFr, row.nameAr, row.description, row.descriptionFr, row.descriptionAr]
    .some((value) => value?.toLocaleLowerCase().includes(needle));
}
