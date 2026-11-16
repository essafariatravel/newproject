/**
 * Shared wallet-ledger filter resolution (§11/§57).
 *
 * Both the wallet page and the CSV export resolve the SAME period semantics
 * from the SAME query parameters, so a filtered view and its export always
 * agree. All boundaries are half-open [from, to).
 */

export type LedgerPeriod = "all" | "this_month" | "last_month" | "last_3_months" | "custom";

export const LEDGER_PERIODS: LedgerPeriod[] = ["all", "this_month", "last_month", "last_3_months", "custom"];

export function resolveLedgerPeriod(params: {
  period?: string;
  from?: string;
  to?: string;
  /** Injectable clock for tests. */
  now?: Date;
}): { period: LedgerPeriod; from?: Date; to?: Date; fromIso?: string; toIso?: string } {
  const now = params.now ?? new Date();
  const requested = (params.period ?? "all") as LedgerPeriod;
  const period: LedgerPeriod = LEDGER_PERIODS.includes(requested) ? requested : "all";
  const startOfMonth = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));

  switch (period) {
    case "this_month": {
      const from = startOfMonth(now);
      const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
      return { period, from, to, fromIso: iso(from), toIso: iso(to) };
    }
    case "last_month": {
      const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
      const to = startOfMonth(now);
      return { period, from, to, fromIso: iso(from), toIso: iso(to) };
    }
    case "last_3_months": {
      const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));
      const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
      return { period, from, to, fromIso: iso(from), toIso: iso(to) };
    }
    case "custom": {
      const from = parseDay(params.from);
      const to = parseDay(params.to);
      // `to` is inclusive in the UI (a whole day) → push to the next midnight.
      return {
        period,
        from,
        to: to ? new Date(to.getTime() + 24 * 60 * 60 * 1000) : undefined,
        fromIso: params.from,
        toIso: params.to,
      };
    }
    case "all":
    default:
      return { period: "all" };
  }
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseDay(value?: string): Date | undefined {
  if (!value) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return undefined;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}
