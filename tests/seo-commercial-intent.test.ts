import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PUBLIC_AGENCY_DISCOVERY, PUBLIC_AGENCY_READINESS } from "@/lib/public-agency-discovery";
import { PublicAgencyDiscovery, PublicAgencyReadiness } from "@/components/public-agency-discovery";
import { buildPublicMetadata } from "@/lib/seo";
import { SEO_PUBLIC_LOCALES, seoLocalizedPublicPath } from "@/lib/seo-manifest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const production = { VERCEL: "1", VERCEL_ENV: "production" } as const;
describe("Algerian B2B SEO, discovery, and confidentiality", () => {
  it("provides useful, distinct localized links to all four supporting pages", () => {
    for (const locale of SEO_PUBLIC_LOCALES) {
      const copy = PUBLIC_AGENCY_DISCOVERY[locale];
      expect(copy.items.map(item => item.page).sort()).toEqual(["about","b2b","contact","faq"]);
      expect(copy.intro.length).toBeGreaterThan(115);
      expect(copy.items.every(item => item.summary.length > 45)).toBe(true);
      const html = renderToStaticMarkup(createElement(PublicAgencyDiscovery, { locale }));
      for (const item of copy.items) {
        expect(html).toContain('href="' + seoLocalizedPublicPath(item.page, locale) + '"');
        expect(html).toContain(item.title);
      }
      expect((html.match(/<a href=/g) || []).length).toBe(4);
    }
  });
  it("publishes genuine agency guidance, not a public service catalogue", () => {
    for (const locale of SEO_PUBLIC_LOCALES) {
      const copy = PUBLIC_AGENCY_READINESS[locale];
      expect(copy.checks).toHaveLength(3);
      expect(copy.checks.every(item => item.text.length > 110)).toBe(true);
      const html = renderToStaticMarkup(createElement(PublicAgencyReadiness, { locale }));
      expect(html).toContain('href="' + seoLocalizedPublicPath("about", locale) + '"');
      expect(html).toContain("<ol");
      expect(html).not.toMatch(/\\b\\d+[., ]*\\s*(?:DA|DZD|USD|EUR)\\b/i);
    }
  });
  it("keeps the primary keywords in dedicated professional content with consistent metadata", () => {
    const home = source("src/app/(public)/page.tsx");
    const b2b = source("src/app/(public)/b2b/page.tsx");
    expect(home).toContain("<PublicAgencyDiscovery locale={locale} />");
    expect(b2b).toContain("<PublicAgencyReadiness locale={locale} />");
    expect(buildPublicMetadata("b2b", "fr", production).title).toMatch(/Sous-traitance visa B2B/);
    expect(buildPublicMetadata("b2b", "en", production).title).toMatch(/B2B Visa Outsourcing/);
    expect(JSON.stringify(PUBLIC_AGENCY_DISCOVERY.fr)).toMatch(/Algérie/);
    for (const locale of SEO_PUBLIC_LOCALES) {
      expect(JSON.stringify(PUBLIC_AGENCY_DISCOVERY[locale])).not.toMatch(/\\b\\d+[., ]*\\s*(?:DA|DZD|USD|EUR)\\b/i);
    }
  });
});
