import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PublicLanguageLinks } from "@/components/public-language-links";
import { SEO_INDEXABLE_PUBLIC_ENTRIES, SEO_PUBLIC_LOCALES, seoLocalizedPublicPath } from "@/lib/seo-manifest";

describe("SEO V2 crawlable multilingual discovery", () => {
  it("renders direct HTML links for every approved route in every locale", () => {
    for (const { key } of SEO_INDEXABLE_PUBLIC_ENTRIES) {
      for (const locale of SEO_PUBLIC_LOCALES) {
        const html = renderToStaticMarkup(createElement(PublicLanguageLinks, { page: key, locale, label: "Languages" }));
        for (const language of SEO_PUBLIC_LOCALES) {
          expect(html).toContain('href="' + seoLocalizedPublicPath(key, language) + '"');
          expect(html).toContain('hrefLang="' + language + '"');
          expect(html).toContain('lang="' + language + '"');
        }
        expect(html).toContain('dir="rtl"');
        expect(html.match(/aria-current="page"/g)).toHaveLength(1);
        expect(html).not.toContain("<form");
        expect(html).not.toMatch(/href="[^"]*\/(?:portal|admin|api|visas|countries)(?:\/|")/);
      }
    }
  });
  it("renders language discovery only on approved public pages and includes a localized FAQ link", () => {
    const layout = readFileSync("src/app/(public)/layout.tsx", "utf8");
    expect(layout).toContain("{publicPage ? <PublicLanguageLinks");
    expect(layout).toContain('seoLocalizedPublicPath("faq", locale)');
    expect(layout).toContain("<UiLanguageSwitcher");
  });
  it("answers the outsourcing question in all languages without promising visa approval", () => {
    const faq = readFileSync("src/app/(public)/faq/page.tsx", "utf8");
    expect(faq).toContain("What can a travel agency outsource");
    expect(faq).toContain("Que peut sous-traiter une agence de voyages");
    expect(faq).toContain("ما المهام التي يمكن لوكالة السفر إسنادها");
    expect(faq).not.toMatch(/\b\d+[., ]*\s*(?:DA|DZD|USD|EUR)\b/i);
  });
});
