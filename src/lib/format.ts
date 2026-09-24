/** BCP-47 tag per UI locale — dates must never mix languages (§53). */
export function dateLocale(locale: string = "en"): string {
  return locale === "fr" ? "fr-FR" : locale === "ar" ? "ar-DZ" : "en-GB";
}

export function formatDate(d: Date | string | null | undefined, locale: string = "en"): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(dateLocale(locale), { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(d: Date | string | null | undefined, locale: string = "en"): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(dateLocale(locale), {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * DZD-only formatting — operational currency is always DZD.
 * Locale-aware grouping, consistent suffix.
 * Historical rows may carry legacy currency metadata; we preserve the numeric
 * value but render as DZD to avoid €/$ confusion.
 */
export function formatAmount(amount: string | number, currency?: string | null, locale: string = "en"): string {
  const n = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(n)) return `${amount} DZD`;
  const nfLocale = locale === "fr" ? "fr-DZ" : locale === "ar" ? "ar-DZ" : "en-DZ";
  try {
    const formatted = new Intl.NumberFormat(nfLocale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(n);
    return `${formatted} DZD`;
  } catch {
    return `${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} DZD`;
  }
}

/** Alias for explicit DZD formatting where currency param is not needed */
export function formatDZD(amount: string | number, locale: string = "en"): string {
  return formatAmount(amount, "DZD", locale);
}

/** Zero denotes an unpublished processing estimate, never an immediate turnaround. */
export function formatProcessingDays(min: number, max: number): string {
  return min > 0 && max > 0 ? `${min}–${max} working days` : "On request";
}

export function titleize(code: string): string {
  return code
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function personName(p: { firstName: string; middleName?: string | null; lastName: string }) {
  return [p.firstName, p.middleName, p.lastName].filter(Boolean).join(" ");
}

export function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w.charAt(0))
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function bytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
