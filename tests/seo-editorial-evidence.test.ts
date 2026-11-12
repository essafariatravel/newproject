import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PUBLIC_OPERATIONAL_EVIDENCE } from "@/lib/public-operational-evidence";
import { PublicOperationalEvidence } from "@/components/public-operational-evidence";
import { PUBLIC_COMPANY_COPY } from "@/lib/public-company-identity";
import { PublicCompanyIdentity } from "@/components/public-company-identity";
import { SEO_PUBLIC_LOCALES } from "@/lib/seo-manifest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf-8");

describe("professional editorial SEO and public safety", () => {
  it("offers useful, honest examples in all approved languages", () => {
    for (const locale of SEO_PUBLIC_LOCALES) {
      const copy = PUBLIC_OPERATIONAL_EVIDENCE[locale];
      const text = JSON.stringify(copy);
      expect(copy.scenarios).toHaveLength(3);
      expect(copy.title.length).toBeGreaterThan(30);
      expect(copy.intro.length).toBeGreaterThan(110);
      expect(copy.scenarios.every(scenario => scenario.title.length > 10 && scenario.detail.length > 95)).toBe(true);
      expect(copy.limits.length).toBeGreaterThan(100);
      expect(copy.screenshotCaption.length).toBeGreaterThan(40);
      expect(text).not.toMatch(/\\b\\d[\\d,. ]*\\s*(?:DA|DZD|EUR|USD)\\b/i);
      expect(text).not.toMatch(/(?:approval|obtention|الموافقة).{0,30}(?:guaranteed|garantie|مضمونة)/i);
    }
  });

  it("uses the existing demo capture and never accesses live user data", () => {
    for (const locale of SEO_PUBLIC_LOCALES) {
      const markup = renderToStaticMarkup(createElement(PublicOperationalEvidence, { locale }));
      expect(markup).toContain(`/images/workflow/intake-${locale}.webp`);
      expect(markup).toContain(`/images/workflow/intake-${locale}-small.webp`);
      expect(markup).toContain('loading="lazy"');
      expect(markup).toContain("<figcaption>");
      expect(markup).toContain("<h2");
    }
    const component = source("src/components/public-operational-evidence.tsx");
    expect(component).not.toContain("prisma.");
    expect(component).not.toContain("getSession");
    expect(component).not.toContain("fetch(");
    expect(component).not.toContain("cookies(");
    expect(source("src/app/(public)/b2b/page.tsx")).toContain("<PublicOperationalEvidence locale={locale} />");
  });

  it("links operator accountability to the same-locale B2B information", () => {
    const paths = { en: "/b2b", fr: "/fr/b2b", ar: "/ar/b2b" } as const;
    for (const locale of SEO_PUBLIC_LOCALES) {
      expect(PUBLIC_COMPANY_COPY[locale].methodBody.length).toBeGreaterThan(100);
      const markup = renderToStaticMarkup(createElement(PublicCompanyIdentity, { locale }));
      expect(markup).toContain(`href="${paths[locale]}"`);
      expect(markup).toContain(PUBLIC_COMPANY_COPY[locale].methodLink);
      expect(markup).toContain("03217141");
      expect(markup).toContain("2220");
    }
  });

  it("keeps consular approval and document clarifications distinct in the FAQ", () => {
    const faq = source("src/app/(public)/faq/page.tsx");
    expect(faq).toContain("Who makes the final visa decision?");
    expect(faq).toContain("Qui prend la décision finale pour un visa ?");
    expect(faq).toContain("من يتخذ القرار النهائي بشأن التأشيرة؟");
    expect(faq).toContain("What happens if a document needs clarification?");
    expect(faq).not.toMatch(/\\b\\d[\\d,. ]*\\s*(?:DA|DZD|EUR|USD)\\b/i);
  });

  it("retains crawler controls for the public page, but not private areas", () => {
    const b2b = source("src/app/(public)/b2b/page.tsx");
    expect(b2b).toContain('buildPublicMetadata("b2b", await getUiLocale())');
    const sitemap = source("src/app/sitemap.ts");
    expect(sitemap).toContain("buildPublicSitemap()");
    const manifest = source("src/lib/seo-manifest.ts");
    expect(manifest).toContain('"/portal"');
    expect(manifest).toContain('"/admin"');
  });
});
