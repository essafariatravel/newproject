import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("UX/UI final polish — shared foundations", () => {
  it("uses 44px minimum controls and readable operational type", () => {
    const css = read("src/app/globals.css");
    expect(css).toContain("--color-control-border: #8a8f98");
    expect(css).toMatch(/\.btn,[\s\S]*min-h-11[\s\S]*text-base/);
    expect(css).toMatch(/\.input\s*\{[\s\S]*min-h-11[\s\S]*text-base/);
    expect(css).toMatch(/\.pagination-link[\s\S]*min-height:\s*44px/);
    expect(css).toMatch(/\.page-size-option[\s\S]*min-height:\s*44px/);
  });

  it("keeps validation messages readable", () => {
    const forms = read("src/components/forms.tsx");
    expect(forms).toContain("text-base text-red-700");
    expect(forms).toContain("min-h-11");
  });

  it("removes compact 14px and 500-weight shared UI primitives", () => {
    for (const file of ["src/components/ui.tsx", "src/components/app-widgets.tsx"]) {
      const src = read(file);
      expect(src, file).not.toContain("text-sm");
      expect(src, file).not.toContain("font-medium");
      expect(src, file).not.toContain("text-[13px]");
      expect(src, file).not.toContain("text-[11px]");
    }
  });
});
