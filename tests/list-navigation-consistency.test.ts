import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ROW_NAVIGATION_INTERACTIVE_SELECTOR,
  shouldIgnoreRowNavigation,
} from "@/components/navigable-table-row";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("shared entity-row navigation contract", () => {
  it("staff applications keep a semantic detail link and matching double-click destination", () => {
    const page = read("src/app/admin/applications/page.tsx");
    expect(page).toContain('href={`/admin/applications/${r.app.id}`}');
    expect(page).toContain('<NavigableTableRow key={r.app.id} href={`/admin/applications/${r.app.id}`}');
  });

  it("agency applications keep a semantic detail link and matching double-click destination", () => {
    const page = read("src/app/portal/applications/page.tsx");
    expect(page).toContain('href={`/portal/applications/${r.app.id}`}');
    expect(page).toContain('<NavigableTableRow key={r.app.id} href={`/portal/applications/${r.app.id}`}');
  });

  it("registration and visa-type rows use their existing detail/edit routes", () => {
    const registrations = read("src/app/admin/registrations/page.tsx");
    const visaTypes = read("src/app/admin/config/visa-types/page.tsx");
    expect(registrations).toContain('<NavigableTableRow key={reg.id} href={`/admin/registrations/${reg.id}`}');
    expect(registrations).toContain('href={`/admin/registrations/${reg.id}`}');
    for(const column of ["copy.company","copy.contact","copy.submitted","copy.status"]) expect(registrations).toContain(column);
    expect(visaTypes).toContain('<NavigableTableRow key={vt.id} href={`/admin/config/visa-types/${vt.id}`}');
    expect(visaTypes).toContain('href={`/admin/config/visa-types/${vt.id}`}');
  });

  it("applicant rows navigate to the existing parent application detail, never an invented applicant route", () => {
    const staff = read("src/app/admin/applicants/page.tsx");
    const agency = read("src/app/portal/applicants/page.tsx");
    expect(staff).toContain('href={`/admin/applications/${applicationId}`}');
    expect(staff).toContain('<NavigableTableRow key={applicant.id} href={`/admin/applications/${applicationId}`}');
    expect(staff).not.toContain("/admin/applicants/");
    expect(agency).toContain('href={`/portal/applications/${applicationId}`}');
    expect(agency).toContain('<NavigableTableRow key={applicant.id} href={`/portal/applications/${applicationId}`}');
    expect(agency).not.toContain("/portal/applicants/");
  });

  it("staff users stay action-only because no user detail route exists", () => {
    const users = read("src/app/admin/users/page.tsx");
    expect(users).not.toContain("NavigableTableRow");
    expect(users).not.toMatch(/\/admin\/users\/\$\{/);
  });

  it("document and wallet transaction tables stay mixed/action-only, not row-navigable", () => {
    for (const file of [
      "src/app/admin/documents/page.tsx",
      "src/app/portal/documents/page.tsx",
      "src/app/admin/billing/page.tsx",
      "src/app/portal/wallet/page.tsx",
      "src/app/admin/audit/page.tsx",
      "src/app/admin/reports/page.tsx",
    ]) {
      expect(read(file), file).not.toContain("NavigableTableRow");
    }
  });

  it("interactive row controls are excluded from double-click navigation", () => {
    for (const selector of ["a", "button", "input", "select", "textarea", "label", "form", "[role=\"menuitem\"]"]) {
      expect(ROW_NAVIGATION_INTERACTIVE_SELECTOR).toContain(selector);
    }
    expect(shouldIgnoreRowNavigation({ closest: () => ({}) })).toBe(true);
    expect(shouldIgnoreRowNavigation({ closest: () => null })).toBe(false);
  });
});

describe("restrained workspace polish", () => {
  it("removes decorative empty-state glyphs and hover-lift from operational stat cards", () => {
    const ui = read("src/components/ui.tsx");
    expect(ui).not.toContain("✦");
    expect(ui).not.toContain("hover:-translate-y-0.5");
  });

  it("uses restrained segmented controls instead of oversized pill treatment", () => {
    const css = read("src/app/globals.css");
    expect(css).toContain(".ess-segment");
    expect(css).toContain("rounded-lg");
  });
});
