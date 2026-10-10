import { describe, expect, it } from "vitest";
import {
  SEO_PRODUCTION_ORIGIN,
  buildNoIndexMetadata,
  buildOrganizationJsonLd,
  buildPublicMetadata,
  buildPublicSitemap,
  buildRobots,
  isSearchIndexableEnvironment,
  publicCanonicalUrl,
} from "@/lib/seo";
import {
  SEO_INDEXABLE_PUBLIC_ENTRIES,
  SEO_PUBLIC_ROUTE_ENTRIES,
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
  it("uses the canonical Production host only in Production", () => {
    const prod = buildPublicMetadata("b2b", "fr", production);
    const pre = buildPublicMetadata("b2b", "fr", preview);
    expect(prod.alternates?.canonical).toBe(
      `${SEO_PRODUCTION_ORIGIN}/b2b`,
    );
    expect(pre.alternates?.canonical).toBeUndefined();
  });

  it("never emits hreflang while locales are cookie/query based", () => {
    const meta = buildPublicMetadata("home", "ar", production);
    expect(meta.alternates?.languages).toBeUndefined();
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
      SEO_INDEXABLE_PUBLIC_ENTRIES.map((entry) =>
        new URL(entry.path, SEO_PRODUCTION_ORIGIN).toString(),
      ),
    );
    for (const entry of map) {
      const url = new URL(entry.url);
      expect(url.protocol).toBe("https:");
      expect(url.host).toBe("visa.essafariavoyages.com");
      expect(url.search).toBe("");
      expect(url.hash).toBe("");
    }
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
      name: "ESSAFARIA",
      url: SEO_PRODUCTION_ORIGIN,
      logo: `${SEO_PRODUCTION_ORIGIN}/images/essafaria-logo.png`,
    });
  });

  it("builds deterministic canonical URLs", () => {
    expect(publicCanonicalUrl("contact")).toBe(
      `${SEO_PRODUCTION_ORIGIN}/contact`,
    );
  });
});
