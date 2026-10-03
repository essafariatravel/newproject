import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf-8");
}

function expectsNoIndex(path: string): void {
  const body = source(path);
  expect(
    body.includes("buildNoIndexMetadata") ||
      /robots\s*:\s*\{[^}]*index\s*:\s*false/s.test(body),
    `${path} must explicitly remain noindex`,
  ).toBe(true);
}

describe("SEO route classification contract", () => {
  it("centralizes noindex on both authenticated product layouts", () => {
    for (const path of [
      "src/app/admin/layout.tsx",
      "src/app/portal/layout.tsx",
    ]) {
      expectsNoIndex(path);
    }
  });

  it("keeps every account/auth utility route outside search", () => {
    for (const path of [
      "src/app/(public)/login/page.tsx",
      "src/app/(public)/forgot-password/page.tsx",
      "src/app/(public)/change-password/page.tsx",
      "src/app/(public)/agency/register/page.tsx",
      "src/app/(public)/agency/register/success/page.tsx",
      "src/app/(public)/activate/[token]/page.tsx",
      "src/app/(public)/reset-access/[token]/page.tsx",
      "src/app/(public)/agency/verification/[token]/page.tsx",
      "src/app/(public)/countries/page.tsx",
      "src/app/(public)/visas/page.tsx",
      "src/app/(public)/privacy/page.tsx",
      "src/app/(public)/terms/page.tsx",
    ]) {
      expectsNoIndex(path);
    }
  });

  it("keeps token-bearing pages on a no-referrer policy", () => {
    for (const path of [
      "src/app/(public)/activate/[token]/page.tsx",
      "src/app/(public)/reset-access/[token]/page.tsx",
      "src/app/(public)/agency/verification/[token]/page.tsx",
    ]) {
      expect(source(path)).toContain("no-referrer");
    }
  });

  it("uses the shared public metadata builder only on intentional marketing pages", () => {
    for (const path of [
      "src/app/(public)/page.tsx",
      "src/app/(public)/b2b/page.tsx",
      "src/app/(public)/about/page.tsx",
      "src/app/(public)/contact/page.tsx",
      "src/app/(public)/faq/page.tsx",
    ]) {
      expect(source(path)).toContain("buildPublicMetadata");
    }
  });

  it("keeps the operational catalogue redirect routes non-indexable", () => {
    for (const path of [
      "src/app/(public)/countries/page.tsx",
      "src/app/(public)/visas/page.tsx",
    ]) {
      const body = source(path);
      expect(body).toContain('redirect("/login")');
      expect(body).toMatch(/index\s*:\s*false/);
    }
  });
});
