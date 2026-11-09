import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PublicCompanyIdentity } from "@/components/public-company-identity";

describe("public operator identity", () => {
  it("presents the real Algerian operator and professional credentials in each language", () => {
    for (const locale of ["en", "fr", "ar"] as const) {
      const html = renderToStaticMarkup(createElement(PublicCompanyIdentity, { locale }));
      expect(html).toContain("ESSAFARIA TRAVEL");
      expect(html).toContain("03217141");
      expect(html).toContain("2220");
      expect(html).toContain("Oued Smar");
      expect(html).toContain('href="https://www.essafariavoyages.com/"');
      expect(html).not.toMatch(/\b\d+[,. ]*\s*(?:DA|DZD|EUR|USD)\b/i);
    }
  });

  it("uses the configured public address rather than a stale hard-coded copy", () => {
    const html = renderToStaticMarkup(createElement(PublicCompanyIdentity, {
      locale: "fr",
      address: "Siège ESSAFARIA mis à jour, Alger",
    }));
    expect(html).toContain("Siège ESSAFARIA mis à jour, Alger");
    expect(html).not.toContain("Lot Makoudi Ahmed");
  });
});
