import { pickUiLocale, type UiLocale } from "./ui-locale-values";

export function isPublicTokenPath(path: string): boolean {
  return /^\/(?:activate|reset-access|agency\/verification)\/[^/]+$/.test(path);
}

/** Public pages whose language is carried by a query instead of a marketing URL. */
export function supportsPublicLanguageQuery(path: string): boolean {
  return isPublicTokenPath(path) || ["/login", "/forgot-password", "/agency/register", "/agency/register/success",
    "/privacy", "/terms", "/legal/legal-notice", "/legal/cookies", "/legal/commercial"].includes(path);
}

export function publicQueryLocale(path: string, params: URLSearchParams): UiLocale | null {
  if (!supportsPublicLanguageQuery(path)) return null;
  const values = params.getAll("lang");
  return values.length === 1 ? pickUiLocale(values[0]) : null;
}
