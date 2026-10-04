import type { UiLocale } from "@/lib/ui-i18n";
import { contentT } from "@/lib/i18n-content";
export function ErrorView({locale,retry}: {locale: UiLocale; retry: () => void}) {
  const ct=contentT(locale);
  return <main lang={locale} dir={locale === "ar" ? "rtl" : "ltr"} className="flex min-h-[60vh] flex-col items-center justify-center gap-4 bg-white px-6 text-center">
    <h1 className="max-w-lg font-serif text-2xl text-navy-900">{ct("Something went wrong. Please try again.")}</h1>
    <div className="flex flex-wrap justify-center gap-3"><button type="button" onClick={retry} className="btn-primary">{ct("Try again")}</button><a href="/" className="btn-secondary">{ct("Back to homepage")}</a></div>
  </main>;
}
