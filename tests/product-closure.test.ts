import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BRANDING_DEFAULTS, brandingCssOverride } from "@/lib/branding";
import { BrandStudio } from "@/components/brand-studio";
import { contentT } from "@/lib/i18n-content";
import { loginAction } from "@/app/actions/auth";
import { request } from "./helpers/request";
import { publicContactDetails } from "@/lib/public-contact";
import NotFound from "@/app/not-found";
import { pageUser } from "@/lib/page-auth";

describe("approved product identity", () => {
  it("keeps action contrast and typography safe despite legacy visual settings", () => {
    const css = brandingCssOverride({ ...BRANDING_DEFAULTS, primary: "#ffffff", ink: "#ffffff", accent: "#ffffff", radius: "soft", fonts: "classic" });
    expect(css).toContain("--color-iris-600: #102a45");
    expect(css).toContain("--color-navy-900: #071a33");
    expect(css).toContain("--color-gold-500: #c99a32");
    expect(css).toContain("--radius-card: 0.9rem");
    expect(css).toContain("--radius-btn: 0.75rem");
    expect(css).toContain('--font-sans: "Barlow",');
    expect(css).toContain("--font-serif: var(--font-sans)");
    expect(css).toContain("--font-mono: var(--font-sans)");
  });
  it("allows identity updates while exposing no global visual controls", () => {
    const noop = async () => {};
    const html = renderToStaticMarkup(React.createElement(BrandStudio, { initial: BRANDING_DEFAULTS, logoUrl: null, saveAction: noop, uploadLogoAction: noop, removeLogoAction: noop }));
    expect(html).toContain('name="brand.name"');
    expect(html).toContain('name="brand.tagline"');
    expect(html).not.toMatch(/name="brand\.(primary|accent|ink|radius|fonts)"/);
    expect(html).not.toContain('type="color"');
  });
  it("renders the identity editor in French", () => {
    const noop = async () => {};
    const html = renderToStaticMarkup(React.createElement(BrandStudio, { initial: BRANDING_DEFAULTS, logoUrl: null, saveAction: noop, uploadLogoAction: noop, removeLogoAction: noop, locale: "fr" }));
    expect(html).toContain("Identité de marque");
    expect(html).not.toContain(">Brand name<");
    expect(html).toContain("Enregistrer la marque");
  });
  it("omits malformed or demonstration public contact values", () => {
    expect(publicContactDetails({"site.contactEmail":"not-an-email", "site.contactPhone":"+212500000000"}).email).toBe("");
  });
});

describe("critical recovery copy", () => {
  it("renders an unavailable route in Arabic without disclosing record details", async () => {
    request.cookie = "ar";
    try {
      const html = renderToStaticMarkup(await NotFound());
      expect(html).toContain("هذه الصفحة غير موجودة");
      expect(html).toContain("العودة إلى الرئيسية");
      expect(html).not.toContain("The page you are looking for");
    } finally { request.cookie = ""; }
  });
  it("explains session expiry on page authentication redirects", async () => {
    request.cookie = "";
    await expect(pageUser()).rejects.toMatchObject({digest: expect.stringContaining("reason=session-expired")});
  });
  it("returns a localized missing-credentials error from the real login action", async () => {
    request.cookie = "fr";
    try {
      const result = await loginAction({}, new FormData());
      expect(result.error).toBe("Saisissez votre nom d'utilisateur ou e-mail professionnel et votre mot de passe.");
    } finally { request.cookie = ""; }
  });
  it.each(["fr", "ar"] as const)("gives actionable catalogue recovery in %s", locale => {
    const message = contentT(locale)("request.error.VISA_TYPE_INVALID");
    expect(message).not.toContain("request.error");
    expect(message).toMatch(locale === "fr" ? /actualisez|rechargez/i : /حدّث|تحديث|تحميل/);
  });
});
