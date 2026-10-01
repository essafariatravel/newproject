/**
 * PHASE 2.1 regression — public catalogue/pricing policy.
 *
 * All configured catalogue and destination availability is private.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const PUBLIC_SURFACES = [
  "src/app/(public)/page.tsx",
  "src/app/(public)/visas/page.tsx",
  "src/app/(public)/countries/page.tsx",
  "src/app/(public)/b2b/page.tsx",
];

const FORBIDDEN_PATTERNS: Array<{ re: RegExp; why: string }> = [
  { re: /visaTypes|visa_types/, why: "public surface must not touch the visa catalogue table" },
  { re: /visaCategories|visa_categories/, why: "public surface must not touch visa categories" },
  { re: /publicDestinations|activeVisaOptions/, why: "public surface must not query live destination availability" },
  { re: /formatAmount\(/, why: "public surface must not format prices" },
  { re: /\.fee\b|\bfee:/, why: "public surface must not reference fees" },
  { re: /€|USD|US\$/, why: "public surface must not hard-code prices" },
];

describe("public surfaces expose no B2B catalogue or pricing", () => {
  for (const file of PUBLIC_SURFACES) {
    it(`${file} stays catalogue/price free`, () => {
      const src = readFileSync(file, "utf8");
      for (const { re, why } of FORBIDDEN_PATTERNS) {
        const hit = src.split("\n").find((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*") && re.test(l) && !l.includes("no longer queries") && !l.includes("deliberately"));
        expect(hit, `${file}: ${why}${hit ? ` → ${hit.trim()}` : ""}`).toBeFalsy();
      }
    });
  }

  it("legacy destination loader enforces Agency authentication", () => {
    const src = readFileSync("src/lib/public-destinations.ts", "utf8");
    expect(src.indexOf("await requireAgencyUser()")).toBeGreaterThan(-1);
    expect(src.indexOf("await requireAgencyUser()")).toBeLessThan(src.indexOf(".selectDistinct({"));
  });
  it("direct former catalogue routes cannot render anonymous coverage", () => {
    for (const route of ["countries", "visas"]) {
      const src = readFileSync(`src/app/(public)/${route}/page.tsx`, "utf8");
      expect(src).toContain('redirect("/login")');
    }
    expect(readFileSync("src/app/(public)/layout.tsx", "utf8")).not.toMatch(/href=["']\/(?:visas|countries)|href:\s*["']\/(?:visas|countries)/);
  });
});
