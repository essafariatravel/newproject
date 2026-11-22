import { NextResponse, type NextRequest } from "next/server";
import { seoIndexablePageForPath } from "@/lib/seo-manifest";
import { publicQueryLocale } from "@/lib/public-locale";
import { DEFAULT_UI_LOCALE, UI_LOCALE_COOKIE } from "@/lib/ui-locale-values";

// Marketing URLs select their canonical language. Public forms can carry it
// in their query so the document and form agree on first paint.
export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const locale = pathname === "/fr" || pathname.startsWith("/fr/")
    ? "fr"
    : pathname === "/ar" || pathname.startsWith("/ar/")
      ? "ar"
      : "en";
  const originalPath = locale === "en" ? pathname : pathname.slice(3) || "/";
  const page = seoIndexablePageForPath(originalPath);
  const effectiveLocale = page ? locale : publicQueryLocale(pathname, request.nextUrl.searchParams);
  if (!effectiveLocale) return NextResponse.next();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-essafaria-public-locale", effectiveLocale);
  if (page) requestHeaders.set("x-essafaria-public-page", page);
  else requestHeaders.delete("x-essafaria-public-page");
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  // Remember genuine document visits for existing public links without a
  // language parameter. Speculation and server actions never set a preference.
  const documentVisit = request.method === "GET" && request.headers.get("sec-fetch-dest") === "document"
    && !request.headers.has("next-router-prefetch")
    && ![request.headers.get("purpose"), request.headers.get("sec-purpose")].some(value => value?.includes("prefetch"));
  if (documentVisit && (request.cookies.get(UI_LOCALE_COOKIE)?.value ?? DEFAULT_UI_LOCALE) !== effectiveLocale) {
    response.cookies.set(UI_LOCALE_COOKIE, effectiveLocale, {
      path: "/", sameSite: "lax", secure: request.nextUrl.protocol === "https:", maxAge: 60 * 60 * 24 * 365,
    });
  }
  return response;
}

export const config = {
  matcher: [
    "/", "/b2b", "/about", "/contact", "/faq",
    "/fr/:path*", "/ar/:path*",
    "/login", "/forgot-password", "/agency/register", "/agency/register/success",
    "/privacy", "/terms", "/legal/legal-notice", "/legal/cookies", "/legal/commercial",
  ],
};
