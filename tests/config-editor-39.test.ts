/**
 * Config editor + list-surfaces structural guards.
 *
 * These tests pin the *contract* of the staff configuration surface and the
 * shared list standard. They are deliberately structural (source + rendered
 * component assertions) — the visual/behavioural evidence for the same
 * requirements is produced by `scripts/rendered-audit.mjs` against a real
 * running build (search narrowing results, accent-insensitive matching,
 * actionable empty state, pagination standard offered, editor sections named).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CardHeader } from "../src/components/ui";
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS, resolvePageSize } from "../src/lib/queries";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("visa-type editor is organised in the six named sections", () => {
  const page = read("src/app/admin/config/visa-types/[id]/page.tsx");

  it("names INFORMATION, PRICING (DZD), PROCESSING, DOC REQUIREMENTS, WORKFLOW, PUBLICATION", () => {
    for (const id of [
      "vt-section-information-edit",
      "vt-section-pricing",
      "vt-section-processing",
      "vt-section-workflow",
    ]) {
      expect(page, `${id} must exist`).toContain(id);
    }
    // Card-based sections pass through CardHeader.testId.
    for (const id of ["vt-section-information", "vt-section-docs", "vt-section-publication"]) {
      expect(page, `${id} must exist`).toContain(`testId="${id}"`);
    }
    expect(page).toContain("Pricing (DZD)");
    expect(page).toContain("Document requirements");
    expect(page).toContain("Publication");
  });

  it("keeps create/edit forms aligned with the strict visa-type server contract", () => {
    const listPage = read("src/app/admin/config/visa-types/page.tsx");
    for (const field of ["name", "code", "countryId", "categoryId", "fee", "processingMinDays", "processingMaxDays"]) {
      expect(listPage, `create form missing ${field}`).toContain(`name="${field}"`);
    }
    const detailPage = read("src/app/admin/config/visa-types/[id]/page.tsx");
    for (const field of ["name", "countryId", "categoryId", "fee", "processingMinDays", "processingMaxDays", "embassyApplicability"]) {
      expect(detailPage, `edit form missing ${field}`).toContain(`name="${field}"`);
    }
    expect(listPage).toContain("<ConfigTranslations");
    expect(detailPage).toContain("<ConfigTranslations");
  });

  it("keeps every price in DZD and never presents another currency", () => {
    for (const file of [
      "src/app/admin/config/visa-types/[id]/page.tsx",
      "src/app/admin/config/visa-types/page.tsx",
      "src/app/admin/config/document-types/page.tsx",
    ]) {
      const src = read(file);
      expect(src, `${file} must not render EUR/USD/€`).not.toMatch(new RegExp("[€]|\\bEUR\\b|\\bUSD\\b"));
      if (file.includes("visa-types")) expect(src, `${file} prices in DZD`).toContain("DZD");
    }
  });

  it("explains the agency-facing consequence of publishing/unpublishing a programme", () => {
    expect(page).toMatch(/Published to agencies|Not published/);
    expect(page).toMatch(/never.*(?:0|zero) days/);
  });
});

describe("CardHeader forwards its testId to the DOM", () => {
  it("emits data-testid when provided and nothing when omitted", () => {
    const withId = renderToStaticMarkup(
      React.createElement(CardHeader, { title: "Publication", subtitle: "…", testId: "vt-section-publication" }),
    );
    expect(withId).toContain('data-testid="vt-section-publication"');
    const without = renderToStaticMarkup(React.createElement(CardHeader, { title: "Info" }));
    expect(without).not.toContain("data-testid");
  });
});

describe("shared list standard (search, region filter, 20/50/100)", () => {
  it("publishes exactly the 20/50/100 page sizes and defaults to 20", () => {
    expect(PAGE_SIZE_OPTIONS).toEqual([20, 50, 100]);
    expect(DEFAULT_PAGE_SIZE).toBe(20);
  });

  it("sanitises hostile or malformed page-size input back to the default", () => {
    for (const hostile of [undefined, "", "0", "-5", "5000", "abc", "1e9"]) {
      expect(resolvePageSize(hostile)).toBe(DEFAULT_PAGE_SIZE);
    }
    for (const accepted of [20, 50, 100, "50", 100]) {
      expect([20, 50, 100]).toContain(resolvePageSize(accepted));
    }
  });

  it("former public destination route directs visitors to authentication without reading the catalogue", () => {
    const page = read("src/app/(public)/countries/page.tsx");
    expect(page).toContain('redirect("/login")');
    expect(page).toMatch(/robots:\s*\{\s*index:\s*false,\s*follow:\s*false/);
    expect(page).not.toMatch(/publicDestinations|activeVisaOptions|@\/db\/schema|formatAmount|\.fee[^a-zA-Z]/);
    expect(read("src/app/(public)/layout.tsx")).not.toMatch(/href:\s*["']\/(countries|visas)["']/);
  });

  it("agency application list renders cards for phones and keeps the table for desktop", () => {
    const page = read("src/app/portal/applications/page.tsx");
    expect(page).toContain('data-testid="applications-cards"');
    expect(page).toContain("md:hidden");
    expect(page).toContain("hidden md:block");
  });
});
