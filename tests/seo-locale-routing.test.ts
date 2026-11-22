import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { config, proxy } from "@/proxy";
import {
  SEO_INDEXABLE_PUBLIC_ENTRIES,
  SEO_PUBLIC_LOCALES,
  seoIndexablePageForPath,
  seoLocalizedPublicPath,
} from "@/lib/seo-manifest";

const host = "https://visa.essafariavoyages.com";

describe("stable public locale URLs", () => {
  it("exposes only the approved five pages in each of three languages", () => {
    const paths = SEO_INDEXABLE_PUBLIC_ENTRIES.flatMap((entry) =>
      SEO_PUBLIC_LOCALES.map((locale) => seoLocalizedPublicPath(entry.key, locale)),
    );
    expect(paths).toHaveLength(15);
    expect(new Set(paths).size).toBe(15);
    expect(paths).toContain("/");
    expect(paths).toContain("/fr/faq");
    expect(paths).toContain("/ar/contact");
    expect(paths).not.toContain("/fr/portal");
  });

  it("forwards the trusted locale to actual FR/AR routes without rewriting", () => {
    for (const [path, locale, page] of [
      ["/fr", "fr", "home"],
      ["/ar/b2b", "ar", "b2b"],
      ["/fr/contact", "fr", "contact"],
    ]) {
      const response = proxy(new NextRequest(`${host}${path}`));
      expect(response.headers.get("x-middleware-rewrite")).toBeNull();
      expect(response.headers.get("x-middleware-request-x-essafaria-public-locale")).toBe(locale);
      expect(response.headers.get("x-middleware-request-x-essafaria-public-page")).toBe(page);
    }
  });

  it("keeps existing English URLs intact and forces their English locale", () => {
    for (const page of SEO_INDEXABLE_PUBLIC_ENTRIES) {
      const response = proxy(new NextRequest(`${host}${page.path}`, {
        headers: { cookie: "essafaria_locale=fr" },
      }));
      expect(response.headers.get("x-middleware-rewrite")).toBeNull();
      expect(response.headers.get("x-middleware-request-x-essafaria-public-locale")).toBe("en");
    }
  });

  it("never rewrites token, account, portal, admin or unknown localized routes", () => {
    for (const path of ["/fr/login", "/ar/portal", "/fr/api/session", "/ar/agency/register"]) {
      expect(seoIndexablePageForPath(path.replace(/^\/(fr|ar)/, "") || "/")).toBeNull();
      const response = proxy(new NextRequest(`${host}${path}`));
      expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    }
    expect(config.matcher).not.toContain("/admin/:path*");
    expect(config.matcher).not.toContain("/portal/:path*");
  });

  it("gives the login document the explicit language of the agency link", () => {
    for (const locale of ["fr", "en", "ar"]) {
      const response = proxy(new NextRequest(`${host}/login?reason=session-expired&lang=${locale}`, {
        headers: { cookie: "evos_ui_locale=ar" },
      }));
      expect(response.headers.get("x-middleware-request-x-essafaria-public-locale")).toBe(locale);
      expect(response.headers.get("x-middleware-request-x-essafaria-public-page")).toBeNull();
      expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    }
    for (const query of ["lang=xx", "lang=fr&lang=ar"]) {
      expect(proxy(new NextRequest(`${host}/login?${query}`)).headers.get("x-middleware-request-x-essafaria-public-locale")).toBeNull();
    }
  });

  it("remembers a public document visit and ignores speculative navigation", () => {
    for (const path of ["/ar", "/login?lang=ar", "/forgot-password?lang=ar"]) {
      const visit = proxy(new NextRequest(host + path, { headers: { "sec-fetch-dest": "document" } }));
      expect(visit.cookies.get("evos_ui_locale")?.value).toBe("ar");
      const prefetch = proxy(new NextRequest(host + path, { headers: { "sec-fetch-dest": "document", "sec-purpose": "prefetch;prerender" } }));
      expect(prefetch.cookies.get("evos_ui_locale")).toBeUndefined();
    }
  });
});
