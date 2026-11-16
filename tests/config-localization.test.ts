import { describe, expect, it } from "vitest";
import { configDescription, configMatches, configName } from "../src/lib/config-localization";

describe("configured catalogue translations", () => {
  const row = { name: "Tourist", nameFr: "Tourisme", nameAr: "سياحة", code: "TOURIST", description: "Holiday travel", descriptionFr: "Voyages de vacances", descriptionAr: "رحلات سياحية" };

  it("uses the requested configured name and description", () => {
    expect(configName(row, "en")).toBe("Tourist");
    expect(configName(row, "fr")).toBe("Tourisme");
    expect(configName(row, "ar")).toBe("سياحة");
    expect(configDescription(row, "fr")).toBe("Voyages de vacances");
    expect(configDescription(row, "ar")).toBe("رحلات سياحية");
  });

  it("falls back to existing content without inventing translations or changing snapshots", () => {
    const legacy = { name: "Legacy name", description: "Original description", nameFr: " ", nameAr: null, descriptionFr: null };
    const before = { ...legacy };
    expect(configName(legacy, "fr")).toBe("Legacy name");
    expect(configName(legacy, "ar")).toBe("Legacy name");
    expect(configDescription(legacy, "fr")).toBe("Original description");
    expect(configDescription({ name: "Name" }, "ar")).toBe("");
    expect(legacy).toEqual(before);
  });

  it("matches configured translations, descriptions and stable codes in any UI language", () => {
    for (const query of ["tourist", "TOURISME", "سياحة", "vacances", "سياحية", "   "]) {
      expect(configMatches(row, query)).toBe(true);
    }
    expect(configMatches(row, "business")).toBe(false);
    expect(configMatches({ name: "No translations" }, "missing")).toBe(false);
  });
});
