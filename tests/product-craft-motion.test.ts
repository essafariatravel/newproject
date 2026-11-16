import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("ESSAFARIA shared motion system", () => {
  it("defines compact micro, standard and spatial motion tokens with a shared deceleration curve", () => {
    const css = read("src/app/globals.css");
    expect(css).toContain("--motion-micro: 120ms");
    expect(css).toContain("--motion-standard: 200ms");
    expect(css).toContain("--motion-spatial: 240ms");
    expect(css).toContain("--motion-ease-out: cubic-bezier(0.16, 1, 0.3, 1)");
  });

  it("keeps operational rows color-only with no lift or scale", () => {
    const css = read("src/app/globals.css");
    expect(css).toMatch(/\.tr-hover\s*\{[^}]*background-color/s);
    const row = read("src/components/navigable-table-row.tsx");
    expect(row).not.toMatch(/scale|translate|animate/i);
  });

  it("gives drawers and dialogs spatial motion while preserving RTL direction", () => {
    const css = read("src/app/globals.css");
    expect(css).toContain("--drawer-shift: -18px");
    expect(css).toContain('[dir="rtl"] .workspace-drawer');
    expect(css).toContain("--drawer-shift: 18px");
    expect(css).toMatch(/\.workspace-drawer[\s\S]*var\(--motion-spatial\)/);
    expect(css).toMatch(/\.config-dialog[\s\S]*var\(--motion-spatial\)/);
  });

  it("uses the shared motion language for workspace and public navigation", () => {
    const css = read("src/app/globals.css");
    const nav = read("src/components/nav-list.tsx");
    const publicHeader = read("src/components/public-header.tsx");
    expect(nav).toContain("workspace-nav-link");
    expect(publicHeader).toContain("public-menu-panel");
    expect(css).toContain(".workspace-nav-link");
    expect(css).toContain(".public-menu-panel");
  });

  it("uses an intentional reduced-motion path instead of a global 0.01ms kill switch", () => {
    const css = read("src/app/globals.css");
    expect(css).not.toContain("*, *::before, *::after { animation-duration: .01ms");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain(".wizard-panel");
    expect(css).toContain(".workspace-drawer");
    expect(css).toContain(".public-motion-ready .public-reveal");
  });
});

describe("wizard craft", () => {
  it("keeps the existing three-step workflow and adds directional continuity without changing persistence semantics", () => {
    const wizard = read("src/app/portal/applications/new/request-wizard.tsx");
    expect(wizard).toContain("The 3-step visa request wizard");
    expect(wizard).toContain('data-testid="wizard-steps"');
    expect(wizard).toContain("wizard-panel");
    expect(wizard).toContain("wizardDirection");
    expect(wizard).toContain('data-direction={wizardDirection}');
    expect(wizard).toContain("setStep(Math.min(3, step + 1))");
    expect(wizard.match(/className="directional"/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("avoids pill-heavy destination controls in the high-frequency wizard", () => {
    const wizard = read("src/app/portal/applications/new/request-wizard.tsx");
    expect(wizard).not.toContain('className="rounded-full border border-slate-200 bg-white px-3.5 py-2');
  });
});

describe("visual craft restraint", () => {
  it("removes public card lift and generic hero/benefit template patterns while keeping directional CTA motion", () => {
    const css = read("src/app/globals.css");
    const home = read("src/app/(public)/page.tsx");
    expect(css).not.toContain("public-card:hover { transform: translateY(-5px)");
    expect(home).not.toContain("backdrop-blur-sm");
    expect(home).not.toContain("B2B Visa Processing Platform");
    expect(home).not.toContain('className="public-card card p-6"');
    expect(home).toContain('className="public-cta');
    expect(home).toContain('className="directional-arrow"');
    expect(css).toContain(".public-cta:hover .directional-arrow");
  });

  it("uses restrained file controls on operational upload surfaces", () => {
    const detail = read("src/components/application-detail.tsx");
    const profile = read("src/app/portal/profile/page.tsx");
    expect(detail).not.toContain("file:rounded-full");
    expect(profile).not.toContain("file:rounded-full");
    expect(detail).toContain("file:rounded-md");
    expect(profile).toContain("file:rounded-md");
  });

  it("uses quieter workspace typography and control geometry", () => {
    const ui = read("src/components/ui.tsx");
    const css = read("src/app/globals.css");
    expect(ui).toContain('className="page-header');
    expect(ui).toContain("font-semibold");
    expect(css).toContain(".workspace-staff .page-header");
    expect(css).toContain(".workspace-agency .page-header");
    expect(css).toMatch(/\.input\s*\{[\s\S]*rounded-lg/);
  });

  it("animates popovers with shared tokens without adding a motion dependency", () => {
    const datePicker = read("src/components/date-picker.tsx");
    const pkg = read("package.json");
    expect(datePicker).toContain("surface-popover");
    expect(pkg).not.toMatch(/framer-motion|motion\/react|@motionone/);
  });
});
