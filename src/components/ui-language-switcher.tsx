"use client";

import { usePathname } from "next/navigation";
import { pickUiLocale, UI_LOCALES, UI_LOCALE_NAMES, type UiLocale } from "@/lib/ui-locale-values";
import { setUiLocaleAction } from "@/app/actions/ui-locale";

/**
 * Global language switcher (EN / FR / AR). Native forms post the locale and
 * current local URL to the cookie-writing server action, so changing language
 * keeps the visitor on the same screen while retaining a no-script fallback.
 */
export function UiLanguageSwitcher({
  locale,
  nextPath,
  onDark = false,
}: {
  locale: UiLocale | string;
  nextPath?: string;
  onDark?: boolean;
  /** Legacy layout hint retained; each locale option remains a 44px target. */
  compact?: boolean;
}) {
  const current = pickUiLocale(locale) ?? "en";
  const pathname = usePathname();
  const destination = nextPath ?? pathname ?? "/";
  const base = onDark
    ? "bg-white/10 border-white/25 text-white/80"
    : "bg-white border-line/80 text-slate-500";
  const active = onDark ? "bg-white text-navy-900 shadow-sm" : "bg-navy-900 text-white shadow-sm";
  return (
    <div
      role="group"
      aria-label="Language"
      className={`inline-flex items-center gap-2 rounded-full border p-1 backdrop-blur-sm ${base}`}
    >
      {UI_LOCALES.map((l) => (
        <form key={l} action={setUiLocaleAction} className="contents" onSubmit={(event) => {
          if (nextPath) return;
          const next = event.currentTarget.elements.namedItem("next");
          if (next instanceof HTMLInputElement) next.value = `${window.location.pathname}${window.location.search}`;
        }}>
          <input type="hidden" name="locale" value={l} />
          <input type="hidden" name="next" value={destination} />
          <button
            type="submit"
            className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-full px-2 py-2 text-xs font-semibold transition-colors ${
              l === current ? active : "hover:text-navy-900"
            }`}
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
