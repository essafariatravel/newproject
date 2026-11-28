import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Phase 2 Final — agency portal simple nav: Dashboard, Applications, New, Wallet, Notifications, Communications, Profile.
 * No standalone Applicants/Documents. Dossier simplified to Overview/Documents/Messages/Activity.
 */
describe("Task 7 — standalone Applicants/Documents removed from sidebars", () => {
  it("staff sidebar keeps all sections but drops Applicants/Documents", () => {
    const s = readFileSync("src/app/admin/layout.tsx", "utf8");
    expect(s).not.toContain('"/admin/applicants"');
    expect(s).not.toContain('"/admin/documents"');
    for (const kept of ["/admin/applications", "/admin/communications", "/admin/agencies", "/admin/billing", "/admin/config/statuses"]) {
      expect(s.includes(kept), `kept entry missing: ${kept}`).toBe(true);
    }
  });
  it("agency portal sidebar drops Applicants/Documents for AGENCY_ADMIN and AGENCY_USER", () => {
    const s = readFileSync("src/app/portal/layout.tsx", "utf8");
    expect(s).not.toContain('"/portal/applicants"');
    expect(s).not.toContain('"/portal/documents"');
    for (const kept of ["/portal", "/portal/applications", "/portal/applications/new", "/portal/wallet"]) {
      expect(s.includes(kept), `kept entry missing: ${kept}`).toBe(true);
    }
  });
  it("application workspace is simplified dossier: Overview/Documents/Messages/Activity, one applicant", () => {
    const detail = readFileSync("src/app/portal/applications/[id]/page.tsx", "utf8");
    // New simplified tabs
    expect(detail).toContain("overview");
    expect(detail).toContain("documents");
    expect(detail).toContain("messages");
    expect(detail).toContain("activity");
    // One applicant model
    expect(detail).toContain("Applicant");
    // Documents handling
    expect(detail).toContain("Documents");
    // No legacy multi-applicant add
    expect(detail).not.toContain("Add applicant");
  });
});

describe("Task 2/3 — CTA + registration submit button share the polished button system", () => {
  it(".btn-cta participates in the shared button base (radius/typography/states)", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    const baseGroup = css.slice(css.indexOf(".btn,"), css.indexOf("{", css.indexOf(".btn,")) + 1);
    expect(baseGroup).toContain(".btn-cta");
    expect(css).toContain("--radius-btn");
    expect(/focus-visible:outline-2/.test(css)).toBe(true);
  });
  it("registration submit remains visibly a button when enabled/disabled/loading", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    const primary = css.slice(css.indexOf(".btn-primary {"), css.indexOf("}", css.indexOf(".btn-primary {")));
    expect(primary).toContain("text-white");
    expect(primary).toContain("bg-navy-900");
    expect(css).toContain("disabled:opacity-50");
    expect(css).toContain("disabled:cursor-not-allowed");
    const form = readFileSync("src/app/(public)/agency/register/registration-form.tsx", "utf8");
    expect(form).toContain('className="btn-primary');
    expect(form).toContain("copy.submitPending");
    expect(form).toContain("<Spinner/>");
    expect(form).toContain("disabled={pending || !verified}");
  });
});

describe("Task 4 — registration success readability tokens", () => {
  it("keeps the title and secondary text legible on the white registration receipt", () => {
    const receipt = readFileSync("src/app/(public)/agency/register/success/page.tsx", "utf8");
    const rules = readFileSync("src/app/(public)/agency/register/registration-premium.css", "utf8");
    const tokens = readFileSync("src/app/public-design.css", "utf8");
    expect(receipt).toContain('className="registration-receipt"');
    expect(receipt).toContain("registrationCopy(locale)");
    expect(rules).toMatch(/\.registration-receipt\s*\{[^}]*background: var\(--registration-surface\)/);
    expect(rules).toContain("--registration-surface: var(--color-white)");
    expect(rules).toMatch(/\.receipt-steps li\s*\{[^}]*color: var\(--public-muted\)/);
    for (const token of ["public-ink", "public-muted"]) {
      const hex = tokens.match(new RegExp(`--${token}: #([a-f0-9]{6});`, "i"))?.[1] ?? "";
      expect(hex).toHaveLength(6);
      const channel = (offset: number) => {
        const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
        return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
      };
      const luminance = .2126 * channel(0) + .7152 * channel(2) + .0722 * channel(4);
      expect(1.05 / (luminance + .05)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
