import type { UiLocale } from "@/lib/ui-locale-values";

// The exports show the actual agency wizard before entering traveller details
// or selecting a visa programme. Large and narrow views were captured separately.
export function visaCapture(locale: UiLocale) {
  const base = `/images/workflow/visa-v2-${locale}`;
  return {
    wide: `${base}.webp`,
    small: `${base}-small.webp`,
    width: 1788,
    height: 512,
    smallWidth: 728,
    smallHeight: locale === "fr" ? 940 : 900,
  };
}
