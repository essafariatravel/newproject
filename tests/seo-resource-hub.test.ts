import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PUBLIC_RESOURCE_COPY } from "@/lib/public-resources";
import { buildPublicMetadata, buildPublicSitemap, publicCanonicalUrl } from "@/lib/seo";
import { SEO_PUBLIC_LOCALES, seoLocalizedPublicPath } from "@/lib/seo-manifest";
const production = { VERCEL: "1", VERCEL_ENV: "production" };
const preview = { VERCEL: "1", VERCEL_ENV: "preview" };

describe("professional resource hub", () => {
  it("offers three useful localized guides without private catalogue data", () => {
    for (const locale of SEO_PUBLIC_LOCALES) {
      const copy = PUBLIC_RESOURCE_COPY[locale];
      expect(copy.guides).toHaveLength(3);
      expect(new Set(copy.guides.map(g => g.id)).size).toBe(3);
      for (const guide of copy.guides) {
        expect(guide.steps).toHaveLength(4);
        expect(guide.steps.every(s => s.length > 65)).toBe(true);
      }
      expect(JSON.stringify(copy)).not.toMatch(/\b\d+[,. ]*\s*(DA|DZD|USD|EUR)\b/i);
      expect(buildPublicMetadata("resources", locale, production).alternates?.canonical).toBe(publicCanonicalUrl("resources", locale));
      expect(buildPublicMetadata("resources", locale, preview).alternates?.canonical).toBeUndefined();
      expect(buildPublicSitemap(production).some(p => p.url === publicCanonicalUrl("resources", locale))).toBe(true);
      expect(seoLocalizedPublicPath("resources", locale)).not.toMatch(/portal|admin|visas|countries/);
    }
    expect(buildPublicSitemap(preview)).toEqual([]);
  });
  it("keeps the hub server rendered, text-first and linked from public pages", () => {
    for (const path of ["layout.tsx", "b2b/page.tsx", "faq/page.tsx"]) {
      expect(readFileSync("src/app/(public)/" + path, "utf8")).toContain('seoLocalizedPublicPath("resources", locale)');
    }
    const source = readFileSync("src/app/(public)/resources/page.tsx", "utf8");
    expect(source).not.toMatch(/use client|<img|<video|@\/lib\/db|@\/lib\/queries/);
    expect(source).toContain('buildPublicMetadata("resources"');
  });
});
