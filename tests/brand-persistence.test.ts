/**
 * PHASE 2.1 regression — Brand Studio persistence.
 *
 * Bug fixed in Phase 2.1: the Brand Studio rendered its inputs and the
 * "Save branding" button WITHOUT any enclosing <form>, so the live preview
 * updated but nothing was ever posted or persisted. These guards pin:
 *   1. the rendered editor posts every branding field inside one <form>, and
 *   2. the settings round-trip through the real database persists values
 *      (exactly the path saveBrandingAction uses).
 */
import { describe, expect, it } from "vitest";
import { suiteSetup } from "./helpers/global-state";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BrandStudio } from "../src/components/brand-studio";
import { BRANDING_DEFAULTS, readBranding } from "../src/lib/branding";
import { updateSetting } from "../src/lib/settings";
import { db } from "../src/lib/db";
import { siteSettings } from "../src/db/schema";
import { eq } from "drizzle-orm";

suiteSetup();

const noop = async () => {};

describe("Brand Studio renders a real persisting form", () => {
  const html = renderToStaticMarkup(
    React.createElement(BrandStudio, {
      initial: BRANDING_DEFAULTS,
      logoUrl: null,
      saveAction: noop,
      uploadLogoAction: noop,
      removeLogoAction: noop,
    }),
  );

  function innerFormHtml(formIndex: number, field: string): string | null {
    const forms = html.match(/<form[\s\S]*?<\/form>/g) ?? [];
    for (const f of forms) {
      if (f.includes(`name="${field}"`)) return f;
    }
    expect(forms.length, `at least one <form> exists (form #${formIndex})`).toBeGreaterThan(formIndex);
    return null;
  }

  it("posts brand.primary from inside a form", () => {
    expect(innerFormHtml(0, "brand.primary")).toContain('name="brand.primary"');
  });

  it("posts brand.accent / brand.ink from inside a form", () => {
    expect(innerFormHtml(0, "brand.accent")).toBeTruthy();
    expect(innerFormHtml(0, "brand.ink")).toBeTruthy();
  });

  it("posts brand.radius, brand.fonts, brand.name and brand.tagline from inside a form", () => {
    expect(innerFormHtml(0, "brand.radius")).toBeTruthy();
    expect(innerFormHtml(0, "brand.fonts")).toBeTruthy();
    expect(innerFormHtml(0, "brand.name")).toBeTruthy();
    expect(innerFormHtml(0, "brand.tagline")).toBeTruthy();
  });

  it("the Save branding button lives inside the field-bearing form", () => {
    const f = innerFormHtml(0, "brand.primary");
    expect(f).toContain("Save branding");
    expect(f).toContain('type="submit"');
  });
});

describe("Branding persists through the database settings path", () => {
  it("round-trips every Brand Studio field", async () => {
    const stamp = Date.now().toString(16);
    await updateSetting("brand.primary", `#${stamp.slice(0, 6)}`.padEnd(7, "0"), null);
    await updateSetting("brand.accent", "#112233", null);
    await updateSetting("brand.ink", "#445566", null);
    await updateSetting("brand.radius", "balanced", null);
    await updateSetting("brand.fonts", "classic", null);
    await updateSetting("brand.name", `Audit Brand ${stamp}`, null);
    await updateSetting("brand.tagline", `Test tagline ${stamp}`, null);

    // Re-read through a fresh request-equivalent (bypass the React cache by
    // hitting the same low-level reader the layout uses after navigation).
    const rows = await db.select().from(siteSettings).where(eq(siteSettings.key, "brand.name"));
    expect(rows[0]?.value).toBe(`Audit Brand ${stamp}`);

    const branding = await readBranding();
    expect(branding.accent).toBe("#112233");
    expect(branding.ink).toBe("#445566");
    expect(branding.radius).toBe("balanced");
    expect(branding.fonts).toBe("classic");
    expect(branding.name).toBe(`Audit Brand ${stamp}`);
    expect(branding.tagline).toBe(`Test tagline ${stamp}`);
    expect(branding.primary).toMatch(/^#[0-9a-f]{6}$/);
  });
});
