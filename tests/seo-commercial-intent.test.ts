import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PUBLIC_AGENCY_READINESS } from "@/lib/public-agency-discovery";
import { PublicAgencyReadiness } from "@/components/public-agency-discovery";
import { buildPublicMetadata } from "@/lib/seo";
import { SEO_PUBLIC_LOCALES, seoLocalizedPublicPath } from "@/lib/seo-manifest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const production = { VERCEL: "1", VERCEL_ENV: "production" } as const;
describe("Algerian B2B SEO, discovery, and confidentiality", () => {
  it("avoids duplicate corporate sections on home while keeping public navigation crawlable", () => {
    const home = source("src/app/(public)/page.tsx");
    const layout = source("src/app/(public)/layout.tsx");
    const about = source("src/components/public-company-identity.tsx");
    expect(home).not.toContain("PublicAgencyDiscovery");
    expect(home).not.toContain("PUBLIC_COMPANY_FACTS");
    expect(home).not.toContain("PublicCompanyIdentity");
    expect(home).toContain("<PublicVisaChapters locale={locale} />");
    expect(home).toContain('id="agency-access"');
    for (const path of ["/b2b", "/faq", "/about", "/contact"]) {
      expect(layout).toContain('href: "' + path + '"');
    }
    expect(layout).toContain('seoLocalizedPublicPath("b2b", locale)');
    expect(layout).toContain('seoLocalizedPublicPath("about", locale)');
    expect(about).toContain('facts.tourismLicence');
    expect(about).toContain('facts.iataNumber');
    expect(about).toContain('facts.fallbackAddress');
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
    expect(home).not.toContain("PublicAgencyDiscovery");
    expect(b2b).toContain("<PublicAgencyReadiness locale={locale} />");
    expect(buildPublicMetadata("b2b", "fr", production).title).toMatch(/Sous-traitance visa B2B/);
    expect(buildPublicMetadata("b2b", "en", production).title).toMatch(/B2B Visa Outsourcing/);
    expect(JSON.stringify(PUBLIC_AGENCY_READINESS.fr)).toMatch(/ESSAFARIA|portail/);
    for (const locale of SEO_PUBLIC_LOCALES) {
      expect(JSON.stringify(PUBLIC_AGENCY_READINESS[locale])).not.toMatch(/\\b\\d+[., ]*\\s*(?:DA|DZD|USD|EUR)\\b/i);
    }
  });
});
