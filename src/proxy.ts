import { NextResponse, type NextRequest } from "next/server";
import {
  seoIndexablePageForPath,
} from "@/lib/seo-manifest";

// Limit rewrites to the five approved marketing pages. Authentication, portal,
// admin, token and API routes never pass through this localization proxy.
export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const locale = pathname === "/fr" || pathname.startsWith("/fr/")
    ? "fr"
    : pathname === "/ar" || pathname.startsWith("/ar/")
      ? "ar"
      : "en";
  const originalPath = locale === "en" ? pathname : pathname.slice(3) || "/";
  const page = seoIndexablePageForPath(originalPath);
  if (!page) return NextResponse.next();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-essafaria-public-locale", locale);
  requestHeaders.set("x-essafaria-public-page", page);
  if (locale === "en") {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }
  // A real localized App Router page receives the request headers. Rewriting
  // here loses the request override in the deployed Next.js adapter.
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    "/", "/b2b", "/about", "/contact", "/faq",
    "/fr/:path*", "/ar/:path*",
  ],
};
