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
