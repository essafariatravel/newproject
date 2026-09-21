/**
 * PHASE 2.1 regression — public catalogue/pricing policy.
 *
 * Visa programmes, categories, fees and the catalogue structure are private
 * B2B information (Agency Portal only). This guard scans the PUBLIC page
 * sources and fails if any of them re-introduces catalogue/pricing access:
 * not with CSS hiding — no fee/visa-type query or price formatter may exist
 * in public surfaces at all.
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
});
