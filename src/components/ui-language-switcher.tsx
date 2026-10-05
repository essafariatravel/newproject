import { pickUiLocale, UI_LOCALES, UI_LOCALE_NAMES, type UiLocale } from "@/lib/ui-i18n";
import { setUiLocaleAction } from "@/app/actions/ui-locale";

/**
 * Global language switcher (EN / FR / AR). Pure server component: one small
 * form per locale posting to the cookie-writing server action via progressive
 * enhancement — hidden inputs only, so it works without client JS (approach
 * already proven by the host verification harness).
 */
export function UiLanguageSwitcher({
  locale,
  nextPath,
  onDark = false,
  compact = false,
}: {
  locale: UiLocale | string;
  nextPath?: string;
  onDark?: boolean;
  compact?: boolean;
}) {
  const current = pickUiLocale(locale) ?? "en";
  const base = onDark
    ? "bg-white/10 border-white/25 text-white/80"
    : "bg-white border-line/80 text-slate-500";
  const active = onDark ? "bg-white text-navy-900 shadow-sm" : "bg-navy-900 text-white shadow-sm";
  const languageLabel = "English / Français / العربية";
  const options = UI_LOCALES.map((l) => (
    <form key={l} action={setUiLocaleAction} className="contents">
      <input type="hidden" name="locale" value={l} />
      {nextPath ? <input type="hidden" name="next" value={nextPath} /> : null}
      <button
        type="submit"
        className={`min-h-11 min-w-11 rounded-md px-4 font-semibold transition-colors ${
          compact ? "w-full text-start text-base" : "text-xs"
        } ${l === current ? active : "hover:bg-ivory-50 hover:text-navy-900"}`}
        aria-current={l === current ? "true" : undefined}
        title={UI_LOCALE_NAMES[l]}
      >
        {compact ? UI_LOCALE_NAMES[l] : l === "ar" ? "ع" : l.toUpperCase()}
      </button>
    </form>
  ));

  if (compact) {
    return (
      <details className="ui-locale-menu">
        <summary
          aria-label={languageLabel}
          title={languageLabel}
          className={`grid h-11 min-w-11 place-items-center rounded-lg border text-xs font-semibold ${base}`}
        >
          {current === "ar" ? "ع" : current.toUpperCase()}
        </summary>
        <div className="ui-locale-menu-panel">{options}</div>
      </details>
    );
  }

  return (
    <div role="group" aria-label={languageLabel} className={`inline-flex items-center gap-2 rounded-lg border p-1 ${base}`}>
      {options}
    </div>
  );
}
