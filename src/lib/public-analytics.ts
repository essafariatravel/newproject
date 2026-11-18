/** Public non-secret Google Analytics 4 web-stream measurement identifier. */
export const GA4_MEASUREMENT_ID = "G-GZXQJW9ZHE";
export const GA4_PRODUCTION_HOST = "visa.essafariavoyages.com";
export const GA4_CONSENT_KEY = "essafaria.analytics-consent.v1";

/** The whitelist excludes private Staff/Agency workspaces and all identifier-bearing routes. */
export function isGa4PublicMarketingPath(pathname: string): boolean {
  if (!pathname || pathname.includes("?") || pathname.includes("#")) return false;
  const segments = pathname.split("/").filter(Boolean);
  const rest = ["en", "fr", "ar"].includes(segments[0] ?? "")
    ? segments.slice(1)
    : segments;
  return rest.length === 0 ||
    (rest.length === 1 && ["b2b", "about", "faq", "contact"].includes(rest[0]!));
}
