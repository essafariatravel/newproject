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
  return (
    <div
      role="group"
      aria-label="Language"
      className={`inline-flex items-center gap-1 rounded-full border p-1 backdrop-blur-sm ${base}`}
    >
      {UI_LOCALES.map((l) => (
        <form key={l} action={setUiLocaleAction} className="contents">
          <input type="hidden" name="locale" value={l} />
          {nextPath ? <input type="hidden" name="next" value={nextPath} /> : null}
          <button
            type="submit"
            className={`rounded-full font-semibold transition-colors ${
              compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs"
            } ${l === current ? active : "hover:text-navy-900"}`}
            aria-current={l === current ? "true" : undefined}
            title={UI_LOCALE_NAMES[l]}
          >
            {l === "ar" ? "ع" : l.toUpperCase()}
          </button>
        </form>
      ))}
    </div>
  );
}
