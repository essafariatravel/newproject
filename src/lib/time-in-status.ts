/**
 * §17/§21/§31 — time in the current status.
 *
 * Everything here is derived from REAL timestamps (`application_status_history`,
 * falling back to the application's own created_at when no transition row
 * exists yet). No invented contractual durations, no SLA wording: the UI only
 * ever states what happened and how long ago.
 */

export type UiLocale = "en" | "fr" | "ar";

export interface StatusHistoryEntry {
  toStatusId: string | null;
  createdAt: Date;
}

/**
 * When the application entered its CURRENT status: the newest history row
 * whose target status is the current one, else the provided fallback
 * (submitted/created timestamp).
 */
export function currentStatusSince(
  history: readonly StatusHistoryEntry[],
  currentStatusId: string | null,
  fallback: Date | null,
): Date | null {
  let newest: Date | null = null;
  for (const entry of history) {
    if (entry.toStatusId !== currentStatusId) continue;
    if (!newest || entry.createdAt > newest) newest = entry.createdAt;
  }
  return newest ?? fallback;
}

/** Whole days between two instants (never negative). */
export function elapsedDays(from: Date, now: Date = new Date()): number {
  const ms = Math.max(0, now.getTime() - from.getTime());
  return Math.floor(ms / 86_400_000);
}

interface TimeUnits {
  underMinute: string;
  now: string;
  min: string;
  hour: string;
  day: string;
  month: string;
}

const UNIT: Record<UiLocale, TimeUnits> = {
  en: { underMinute: "<1 min", now: "just now", min: "min", hour: "h", day: "days", month: "months" },
  fr: { underMinute: "<1 min", now: "à l'instant", min: "min", hour: "h", day: "jours", month: "mois" },
  ar: { underMinute: "<1 د", now: "الآن", min: "د", hour: "س", day: "أيام", month: "أشهر" },
};

/**
 * Compact, localized elapsed-time label: "just now", "42 min", "3 h 20 min",
 * "2 days 5 h", "87 days".
 */
export function formatElapsed(ms: number, locale: UiLocale = "en"): string {
  const u = UNIT[locale];
  const safe = Math.max(0, ms);
  const minutes = Math.floor(safe / 60_000);
  if (minutes < 1) return u.underMinute;
  if (minutes < 60) return `${minutes} ${u.min}`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  if (hours < 24) {
    return restMinutes > 0 && hours < 6 ? `${hours} ${u.hour} ${restMinutes} ${u.min}` : `${hours} ${u.hour}`;
  }
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  if (days < 30) {
    return restHours > 0 && days < 4 ? `${days} ${u.day} ${restHours} ${u.hour}` : `${days} ${u.day}`;
  }
  const months = Math.floor(days / 30);
  return `${months} ${u.month}`;
}

/** Elapsed label straight from a timestamp. */
export function elapsedLabel(from: Date | null, locale: UiLocale = "en", now: Date = new Date()): string {
  if (!from) return UNIT[locale].now;
  return formatElapsed(now.getTime() - from.getTime(), locale);
}

export type WaitingBand = "fresh" | "waiting" | "aging";

/**
 * Operational bands used by the staff lists. They are presentation-only
 * helpers over real elapsed days — the application never becomes "overdue",
 * it is simply shown as waiting longer.
 */
export function waitingBand(days: number): WaitingBand {
  if (days >= 7) return "aging";
  if (days >= 3) return "waiting";
  return "fresh";
}
