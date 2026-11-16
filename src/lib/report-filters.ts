import { AppError } from "@/lib/types";
export interface ReportFilters { from?: Date; to?: Date; agencyId?: string; countryId?: string; visaTypeId?: string; statusId?: string; priorityId?: string; officerId?: string }
/** Shared by report page and downloads; the end date includes its entire UTC day. */
export function parseReportFilters(raw: { from?: string; to?: string; agency?: string; country?: string; visa?: string; status?: string; priority?: string; officer?: string }): ReportFilters {
  function day(value?: string) {
    if (!value) return undefined;
    const d = new Date(`${value}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== value) throw new AppError("VALIDATION", "Choose a valid date range.");
    return d;
  }
  const from = day(raw.from), last = day(raw.to);
  if (from && last && from > last) throw new AppError("VALIDATION", "The start date must precede the end date.");
  for (const value of [raw.agency, raw.country, raw.visa, raw.status, raw.priority, raw.officer]) if (value && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new AppError("VALIDATION", "Choose a valid agency.");
  return { from, to: last ? new Date(last.getTime() + 86400000) : undefined, agencyId: raw.agency || undefined, countryId: raw.country || undefined, visaTypeId: raw.visa || undefined, statusId: raw.status || undefined, priorityId: raw.priority || undefined, officerId: raw.officer || undefined };
}
