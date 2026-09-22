import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";

/**
 * Phase 2.2 §8 — ONE reusable DatePicker, every native type="date" gone.
 * (Source-level guards; the component is client-rendered and behaviour is
 *  deterministic pure-JS included here for regressions of the date math.)
 */
const DP = readFileSync(path.join(__dirname, "..", "src/components/date-picker.tsx"), "utf8");

describe("reusable DatePicker (Phase 2.2 §8)", () => {
  it("is a single shared client component with no new dependencies", () => {
    expect(DP).toContain('"use client"');
    expect(DP).not.toMatch(/from "(?!react)/); // no non-react imports
    expect(DP).toContain("Intl.DateTimeFormat"); // localized via Intl
  });

  it("preserves the server-action contract: hidden input carries ISO YYYY-MM-DD", () => {
    expect(DP).toContain('type="hidden"');
    expect(DP).toContain("name={props.name}");
    expect(DP).toContain("YYYY-MM-DD");
  });

  it("exposes keyboard navigation + RTL-aware arrows", () => {
    for (const k of ['"ArrowLeft"','"ArrowRight"','"ArrowUp"','"ArrowDown"','"PageUp"','"PageDown"','"Home"','"End"','"Enter"','"Escape"']) {
      expect(DP).toContain(k);
    }
    expect(DP).toContain('locale === "ar"'); // RTL arrow flip
  });

  it("respects min/max bounds and required (Clear disabled when required)", () => {
    expect(DP).toContain("const allowed = (v: string) =>");
    expect(DP).toContain("props.required");
  });

  it("all previous type=\"date\" inputs are replaced by the shared DatePicker", () => {
    const roots = [
      "src/app/portal/applications/[id]/page.tsx",
      "src/components/wallet-statement-form.tsx",
      "src/components/app-widgets.tsx",
      "src/app/portal/applications/page.tsx",
      "src/app/admin/applications/page.tsx",
    ];
    for (const r of roots) {
      const src = readFileSync(path.join(__dirname, "..", r), "utf8");
      expect(src, r).not.toContain('type="date"');
    }
    const filterBar = readFileSync(path.join(__dirname, "..", "src/components/app-widgets.tsx"), "utf8");
    expect(filterBar).toContain("<DatePicker");
    const form = readFileSync(path.join(__dirname, "..", "src/components/wallet-statement-form.tsx"), "utf8");
    expect(form.match(/<DatePicker/g)?.length).toBe(2);
  });

  it("FilterBar forwards the page-provided interface locale", () => {
    for (const r of ["src/app/portal/applications/page.tsx", "src/app/admin/applications/page.tsx", "src/app/portal/wallet/page.tsx"]) {
      const src = readFileSync(path.join(__dirname, "..", r), "utf8");
      expect(src, r).toContain("locale={uiLocale}");
    }
  });
});

import { yearRangeWindow, clampYearMonth } from "@/components/date-picker";

describe("DatePicker Bug 4 — direct year/month navigation (Phase 2.3)", () => {
  it("exposes YEAR and MONTH panes reachable from the header", () => {
    const src = readFileSync(path.join(__dirname, "..", "src/components/date-picker.tsx"), "utf8");
    expect(src).toContain('"years"');
    expect(src).toContain('"months"');
    expect(src).toContain('aria-label="Choose year"');
    expect(src).toContain('aria-label="Choose month"');
    expect(src).toContain("yearRangeWindow");
    expect(src).toContain("Choose month / year");
  });

  it("yearRangeWindow: 12-year windows stable + aligned", () => {
    expect(yearRangeWindow(2026)).toEqual({ start: 2016, end: 2027 });
    expect(yearRangeWindow(1981)).toEqual({ start: 1980, end: 1991 });
    expect(yearRangeWindow(2000)).toEqual({ start: 1992, end: 2003 });
  });

  it("decades-in-the-past birth-year cost: 2026 → 1981 needs ≤ 4 range-page interactions", () => {
    // clicking ‹ in years view jumps 12 YEARS each: 2026→(2014)→(2002)→(1980) = 3 clicks + 1 click on 1981.
    let pivot = 2026;
    let clicks = 0;
    while (![yearRangeWindow(pivot).start, yearRangeWindow(pivot).end].some((e) => 1981 >= yearRangeWindow(pivot).start && 1981 <= yearRangeWindow(pivot).end)) {
      pivot -= 12; clicks++;
      if (clicks > 10) break;
    }
    expect(clicks).toBeLessThanOrEqual(3);
  });

  it("clampYearMonth keeps selections inside min/max", () => {
    expect(clampYearMonth(2099, 0, "2000-01-01", "2026-06-30")).toEqual({ year: 2026, month: 5 });
    expect(clampYearMonth(1950, 11, "2000-01-01", "2026-06-30")).toEqual({ year: 2000, month: 0 });
    expect(clampYearMonth(2010, 3, "2000-01-01", "2026-06-30")).toEqual({ year: 2010, month: 3 });
  });

  it("years/months grids render localized (Intl) and cells respect min/max disablement", () => {
    const src = readFileSync(path.join(__dirname, "..", "src/components/date-picker.tsx"), "utf8");
    expect(src.match(/new Intl\.DateTimeFormat\(locale, \{ month: "short" \}\)/g)?.length).toBeGreaterThanOrEqual(1);
    expect(src.match(/Intl\.NumberFormat\(locale, \{ useGrouping: false \}\)/g)?.length).toBeGreaterThanOrEqual(2);
    expect(src).toContain("disabledCandidate");
    expect(src).not.toContain('from "react-date');
  });
});
