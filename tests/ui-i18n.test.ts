/**
 * PHASE 2.1 — generalized interface locale layer (EN default, FR + AR with RTL).
 * Guards: dictionary completeness (no mixed untranslated chrome), locale
 * picking, RTL flag, switcher rendering for both header and app shells.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  ALL_CHROME_KEYS,
  chromeHas,
  chromeT,
  isUiRtl,
  pickUiLocale,
  UI_LOCALE_NAMES,
  UI_LOCALES,
} from "@/lib/ui-i18n";
import { UiLanguageSwitcher } from "@/components/ui-language-switcher";

describe("ui locale picking", () => {
  it("accepts only supported locales, case/space-insensitively", () => {
    expect(pickUiLocale("en")).toBe("en");
    expect(pickUiLocale(" FR ")).toBe("fr");
    expect(pickUiLocale("AR")).toBe("ar");
    expect(pickUiLocale("de")).toBeNull();
    expect(pickUiLocale("")).toBeNull();
    expect(pickUiLocale(undefined)).toBeNull();
    expect(pickUiLocale(42)).toBeNull();
  });

  it("flags RTL only for Arabic", () => {
    expect(isUiRtl("ar")).toBe(true);
    expect(isUiRtl("en")).toBe(false);
    expect(isUiRtl("fr")).toBe(false);
  });
});

describe("chrome dictionaries — completeness (no mixed untranslated nav)", () => {
  it("every chrome key exists in FR and AR dictionaries", () => {
    for (const key of ALL_CHROME_KEYS) {
      expect(chromeHas("fr", key), `FR missing: ${key}`).toBe(true);
      expect(chromeHas("ar", key), `AR missing: ${key}`).toBe(true);
    }
  });

  it("EN passes through; unknown keys fall back to the source string", () => {
    const en = chromeT("en");
    expect(en("Dashboard")).toBe("Dashboard");
    const ar = chromeT("ar");
    expect(ar("SomeNonChromePageString")).toBe("SomeNonChromePageString");
  });

  it("Arabic chrome is genuinely Arabic", () => {
    expect(chromeT("ar")("Dashboard")).toMatch(/[\u0600-\u06FF]/);
    expect(chromeT("ar")("Register your agency")).toMatch(/[\u0600-\u06FF]/);
    expect(chromeT("fr")("Register your agency")).toBe("Enregistrer votre agence");
  });

  it("locale names exist for every locale", () => {
    for (const l of UI_LOCALES) expect(UI_LOCALE_NAMES[l].length).toBeGreaterThan(1);
  });
});

describe("UiLanguageSwitcher", () => {
  it("renders one button per locale, marks the current one, forwards redirect target", () => {
    const html = renderToStaticMarkup(
      createElement(UiLanguageSwitcher, { locale: "ar", nextPath: "/visas" }),
    );
    for (const l of UI_LOCALES) expect(html).toContain(`value="${l}"`);
    expect(html).toContain('value="/visas"');
    expect(html).toContain('aria-current="true"');
    // EN / FR / AR short codes present as button labels
    expect(html).toContain("ع");
  });
});
