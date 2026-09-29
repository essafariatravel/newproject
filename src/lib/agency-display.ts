export interface AgencyDisplayFields {
  id: string;
  legalName?: string | null;
  tradingName?: string | null;
}

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Stable agency label for staff surfaces.
 *
 * Historical staff-created rows can contain trading_name='' while public
 * registration approval stores an absent trading name as NULL. Nullish
 * coalescing does not treat '' as missing, so callers must normalize both.
 */
export function agencyPrimaryLabel(agency: AgencyDisplayFields): string {
  return nonEmpty(agency.tradingName) ?? nonEmpty(agency.legalName) ?? `Agency ${agency.id.slice(0, 8).toUpperCase()}`;
}

/** Canonicalize an optional agency name before persistence. */
export function normalizeOptionalAgencyName(value: string | null | undefined): string | null {
  return nonEmpty(value);
}
