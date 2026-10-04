import { contentT } from "@/lib/i18n-content";
import type { UiLocale } from "@/lib/ui-i18n";
import type { LocalizedConfig } from "@/lib/config-localization";

export function ConfigTranslations({ value, locale }: { value?: LocalizedConfig; locale: UiLocale }) {
  const t = contentT(locale);
  return <fieldset className="col-span-full grid gap-4 sm:grid-cols-2">
    <legend className="mb-4 text-sm font-semibold text-navy-900">{t("Translations")}</legend>
    {(["Fr", "Ar"] as const).map((language) => <div key={language} className="space-y-4">
      <label className="block text-sm">{t("Name")} · {language === "Fr" ? "Français" : "العربية"}
        <input name={`name${language}`} maxLength={120} defaultValue={value?.[`name${language}`] ?? ""} dir={language === "Ar" ? "rtl" : "ltr"} className="input mt-1" />
      </label>
      <label className="block text-sm">{t("Description")} · {language === "Fr" ? "Français" : "العربية"}
        <textarea name={`description${language}`} maxLength={1000} rows={2} defaultValue={value?.[`description${language}`] ?? ""} dir={language === "Ar" ? "rtl" : "ltr"} className="input mt-1" />
      </label>
    </div>)}
  </fieldset>;
}
