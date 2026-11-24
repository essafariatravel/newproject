import { SEO_PUBLIC_LOCALES, seoLocalizedPublicPath, type IndexablePublicSeoPage } from "@/lib/seo-manifest";
import { UI_LOCALE_NAMES, type UiLocale } from "@/lib/ui-locale-values";

/** Crawlable language alternatives for approved marketing pages only.
 * The existing cookie-writing language selector remains unchanged.
 */
export function PublicLanguageLinks({ page, locale, label }: {
  page: IndexablePublicSeoPage;
  locale: UiLocale;
  label: string;
}) {
  return (
    <nav aria-label={label} className="flex flex-wrap items-center gap-x-4 text-sm">
      {SEO_PUBLIC_LOCALES.map((language) => (
        <a key={language}
          href={seoLocalizedPublicPath(page, language)}
          hrefLang={language}
          lang={language}
          dir={language === "ar" ? "rtl" : "ltr"}
          aria-current={language === locale ? "page" : undefined}
          className="inline-flex min-h-11 items-center text-white/70 hover:text-white focus-visible:text-white"
        >{UI_LOCALE_NAMES[language]}</a>
      ))}
    </nav>
  );
}
