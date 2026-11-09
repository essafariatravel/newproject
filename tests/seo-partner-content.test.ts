import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PARTNER_PUBLIC_GUIDE } from "@/lib/public-partner-guide";
import { SEO_PUBLIC_LOCALES } from "@/lib/seo-manifest";

describe("public B2B visa partnership content", () => {
  it("offers substantive, locally relevant guidance in every public language", () => {
    for (const locale of SEO_PUBLIC_LOCALES) {
      const guide = PARTNER_PUBLIC_GUIDE[locale];
      expect(guide.audienceTitle.length).toBeGreaterThan(10);
      expect(guide.audienceBody.length).toBeGreaterThan(90);
      expect(guide.stepsTitle.length).toBeGreaterThan(10);
      expect(guide.steps).toHaveLength(4);
      expect(new Set(guide.steps.map((step) => step.title)).size).toBe(4);
      for (const step of guide.steps) {
        expect(step.title.length).toBeGreaterThan(5);
        expect(step.body.length).toBeGreaterThan(50);
      }
      expect(guide.limitationsBody.length).toBeGreaterThan(85);
      expect(guide.faqLink.length).toBeGreaterThan(4);
      expect(guide.contactLink.length).toBeGreaterThan(4);
      expect(JSON.stringify(guide)).not.toMatch(/\b\d[\d,. ]*\s*(?:DA|DZD|EUR|USD)\b/i);
    }
  });

  it("makes the localized guide and related public pages crawlable in B2B markup", () => {
    const page = readFileSync(resolve(process.cwd(), "src/app/(public)/b2b/page.tsx"), "utf-8");
    expect(page).toContain("PARTNER_PUBLIC_GUIDE[locale]");
    expect(page).toContain("guide.steps.map");
    expect(page).toContain('seoLocalizedPublicPath("faq", locale)');
    expect(page).toContain('seoLocalizedPublicPath("contact", locale)');
    expect(page).toMatch(/<h2[^>]*>\{guide\.audienceTitle\}<\/h2>/);
  });
});
