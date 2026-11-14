import { describe, expect, it } from "vitest";
import {
  SEO_PRODUCTION_ORIGIN,
  buildNoIndexMetadata,
  buildOrganizationJsonLd,
  buildPublicMetadata,
  buildPublicSitemap,
  buildRobots,
  isSearchIndexableEnvironment,
  publicLanguageAlternates,
  publicCanonicalUrl,
  publicOrganizationJsonLd,
  serializeJsonLd,
} from "@/lib/seo";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { PublicOrganizationData } from "@/components/public-organization-data";
import {
  SEO_INDEXABLE_PUBLIC_ENTRIES,
  SEO_PUBLIC_LOCALES,
  SEO_PUBLIC_ROUTE_ENTRIES,
  seoLocalizedPublicPath,
} from "@/lib/seo-manifest";

const production = { VERCEL: "1", VERCEL_ENV: "production" } as const;
const preview = { VERCEL: "1", VERCEL_ENV: "preview" } as const;
const development = { VERCEL: "1", VERCEL_ENV: "development" } as const;
const unknown = { VERCEL: undefined, VERCEL_ENV: undefined };

describe("SEO environment safety", () => {
  it("allows indexing only on the explicit Vercel Production environment", () => {
    expect(isSearchIndexableEnvironment(production)).toBe(true);
    expect(isSearchIndexableEnvironment(preview)).toBe(false);
    expect(isSearchIndexableEnvironment(development)).toBe(false);
    expect(isSearchIndexableEnvironment(unknown)).toBe(false);
  });

  it("does not mistake a production Node build for a searchable Preview", () => {
    expect(
      isSearchIndexableEnvironment({ VERCEL: "1", VERCEL_ENV: "preview" }),
    ).toBe(false);
  });
});

describe("public metadata", () => {
  it("explains B2B electronic-visa intent in the main marketing pages for all three languages", () => {
    const terms = {
      en: /evisa/i,
      fr: /evisa/i,
      ar: /التأشيرات الإلكترونية/,
    } as const;
    for (const locale of ["en", "fr", "ar"] as const) {
      for (const page of ["home", "b2b"] as const) {
        const metadata = buildPublicMetadata(page, locale, production);
        expect(`${metadata.title} ${metadata.description}`).toMatch(terms[locale]);
        expect(`${metadata.title} ${metadata.description}`).toMatch(/B2B/i);
        expect(`${metadata.title} ${metadata.description}`).not.toMatch(/\b\d+[,. ]*\s*(DA|DZD|EUR|USD)\b/i);
      }
    }
  });

  it("uses the canonical Production host only in Production", () => {
    const prod = buildPublicMetadata("b2b", "fr", production);
    const pre = buildPublicMetadata("b2b", "fr", preview);
    expect(prod.alternates?.canonical).toBe(
      `${SEO_PRODUCTION_ORIGIN}/fr/b2b`,
    );
    expect(pre.alternates?.canonical).toBeUndefined();
  });

  it("emits reciprocal hreflang only for stable Production public URLs", () => {
    const meta = buildPublicMetadata("home", "ar", production);
    expect(meta.alternates?.canonical).toBe(`${SEO_PRODUCTION_ORIGIN}/ar`);
    expect(meta.alternates?.languages).toEqual({
      en: `${SEO_PRODUCTION_ORIGIN}/`,
      fr: `${SEO_PRODUCTION_ORIGIN}/fr`,
      ar: `${SEO_PRODUCTION_ORIGIN}/ar`,
      "x-default": `${SEO_PRODUCTION_ORIGIN}/`,
    });
    expect(buildPublicMetadata("home", "ar", preview).alternates?.languages).toBeUndefined();
  });

  it("keeps private/auth metadata non-indexable and free of canonical/social data", () => {
    const meta = buildNoIndexMetadata("Application");
    expect(meta.robots).toEqual({ index: false, follow: false });
    expect(meta.description).toBeUndefined();
    expect(meta.alternates).toBeUndefined();
    expect(meta.openGraph).toBeUndefined();
  });
});

describe("sitemap and robots", () => {
  it("advertises only the small intentional public allowlist in Production", () => {
    const map = buildPublicSitemap(production);
    expect(map.map((entry) => entry.url)).toEqual(
      SEO_INDEXABLE_PUBLIC_ENTRIES.flatMap((entry) =>
        SEO_PUBLIC_LOCALES.map((locale) => publicCanonicalUrl(entry.key, locale)),
      ),
    );
    expect(map).toHaveLength(15);
    for (const entry of map) {
      const url = new URL(entry.url);
      expect(url.protocol).toBe("https:");
      expect(url.host).toBe("visa.essafariavoyages.com");
      expect(url.search).toBe("");
      expect(url.hash).toBe("");
      const page = SEO_INDEXABLE_PUBLIC_ENTRIES.find((candidate) =>
        SEO_PUBLIC_LOCALES.some((locale) => publicCanonicalUrl(candidate.key, locale) === entry.url),
      );
      expect(entry.alternates?.languages).toEqual(publicLanguageAlternates(page!.key));
    }
  });

  it("marks only verifiably updated public content with stable lastmod dates", () => {
    const map = buildPublicSitemap(production);
    for (const route of ["b2b", "about", "faq"] as const) {
      for (const locale of SEO_PUBLIC_LOCALES) {
        const url = publicCanonicalUrl(route, locale);
        expect(map.find((page) => page.url === url)?.lastModified).toBe("2026-11-14");
      }
    }
    // Do not invent dates for content without verified significant updates.
    for (const route of ["home", "contact"] as const) {
      for (const locale of SEO_PUBLIC_LOCALES) {
        const url = publicCanonicalUrl(route, locale);
        expect(map.find((page) => page.url === url)?.lastModified).toBeUndefined();
      }
    }
    expect(map).toHaveLength(15);
  });

  it("publishes no sitemap URLs outside Production", () => {
    expect(buildPublicSitemap(preview)).toEqual([]);
    expect(buildPublicSitemap(development)).toEqual([]);
  });

  it("advertises the sitemap only in Production", () => {
    expect(buildRobots(production).sitemap).toBe(
      `${SEO_PRODUCTION_ORIGIN}/sitemap.xml`,
    );
    expect(buildRobots(preview).sitemap).toBeUndefined();
  });
});

describe("manifest safety", () => {
  it("keeps indexable sitemap paths static, clean and unique", () => {
    const paths = SEO_INDEXABLE_PUBLIC_ENTRIES.map((entry) => entry.path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const path of paths) {
      expect(path).not.toMatch(/[?#]/);
      expect(path).not.toContain("[");
    }
  });

  it("keeps every noindex page out of the sitemap", () => {
    for (const entry of SEO_PUBLIC_ROUTE_ENTRIES) {
      expect(entry.sitemap).toBe(entry.classification === "indexable");
    }
  });

  it("never emits Preview or local hosts through public metadata", () => {
    for (const entry of SEO_INDEXABLE_PUBLIC_ENTRIES) {
      const meta = buildPublicMetadata(entry.key, "en", preview);
      const serialized = JSON.stringify(meta);
      expect(serialized).not.toMatch(/\.vercel\.app/i);
      expect(serialized).not.toMatch(/localhost/i);
      expect(serialized).not.toMatch(/127\.0\.0\.1/i);
      expect(meta.alternates?.canonical).toBeUndefined();
      expect(meta.openGraph?.url).toBeUndefined();
    }
  });
});

describe("safe public structured data", () => {
  it("contains only intentional public organization identity", () => {
    expect(buildOrganizationJsonLd()).toEqual({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "ESSAFARIA TRAVEL",
      url: "https://www.essafariavoyages.com/",
      logo: `${SEO_PRODUCTION_ORIGIN}/images/essafaria-logo.png`,
      sameAs: [SEO_PRODUCTION_ORIGIN + "/", "https://www.instagram.com/essafaria.travel/"],
    });
  });

  it("renders organization JSON-LD on Production home routes only", () => {
    const expected = publicOrganizationJsonLd("home", production);
    expect(expected).toBeTruthy();
    const markup = renderToStaticMarkup(createElement(PublicOrganizationData, { page: "home", env: production }));
    expect(markup).toContain('<script type="application/ld+json">');
    expect(markup).toContain('"ESSAFARIA TRAVEL"');
    expect(renderToStaticMarkup(createElement(PublicOrganizationData, { page: "home", env: preview }))).toBe("");
    expect(renderToStaticMarkup(createElement(PublicOrganizationData, { page: "b2b", env: production }))).toBe("");
  });

  it("escapes HTML-significant text when serializing public structured data", () => {
    const serialized = serializeJsonLd({ text: "</script><script>alert(1)</script>" });
    expect(serialized).not.toContain("</script>");
    expect(serialized).toContain("\\u003c/script>");
  });

  it("builds deterministic canonical URLs", () => {
    expect(publicCanonicalUrl("contact")).toBe(
      `${SEO_PRODUCTION_ORIGIN}/contact`,
    );
    expect(publicCanonicalUrl("contact", "fr")).toBe(
      `${SEO_PRODUCTION_ORIGIN}/fr/contact`,
    );
    expect(seoLocalizedPublicPath("home", "ar")).toBe("/ar");
    expect(seoLocalizedPublicPath("faq", "en")).toBe("/faq");
  });
});
