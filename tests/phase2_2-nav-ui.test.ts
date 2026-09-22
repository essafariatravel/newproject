import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Phase 2.2 — sidebar cleanup + registration CTA/button/success readability.
 * Source-level guards: the standalone Applicants/Documents entries must not be
 * part of any STAFF/AGENCY sidebar definition, while pages themselves remain.
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
  it("application workspace retains contextual applicants/documents functionality", () => {
    const detail = readFileSync("src/app/portal/applications/[id]/page.tsx", "utf8");
    expect(detail).toContain("Add applicant");
    expect(detail).toContain("Documents");
    const tabs = readFileSync("src/components/application-detail.tsx", "utf8");
    expect(tabs).toContain("applicants");
    expect(tabs).toContain("documents");
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
    const gold = css.slice(css.indexOf(".btn-gold {"), css.indexOf("}", css.indexOf(".btn-gold {")));
    // readable label in every state + visible disabled ring/shape
    expect(gold).toContain("text-navy-950");
    expect(gold).toContain("disabled:opacity-60");
    expect(gold).toContain("disabled:ring-1");
    const form = readFileSync("src/app/(public)/agency/register/registration-form.tsx", "utf8");
    expect(form).toContain('className="btn-gold');
    expect(form).toContain("disabled={pending}");
  });
});

describe("Task 4 — registration success readability tokens", () => {
  it("success screen uses high-contrast text on the dark panel", () => {
    const s = readFileSync("src/app/(public)/agency/register/success/page.tsx", "utf8");
    expect(s).toContain("text-white");
    expect(s).toContain("text-shadow");
    expect(s).toContain("text-gold-200");
    expect(s).toContain("registrationCopy(locale)");
  });
});
