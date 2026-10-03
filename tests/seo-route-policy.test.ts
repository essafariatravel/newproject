import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SEO_PUBLIC_ROUTE_ENTRIES } from "@/lib/seo-manifest";

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

function tsxFilesUnder(relativeRoot: string): string[] {
  const absoluteRoot = resolve(process.cwd(), relativeRoot);
  const out: string[] = [];
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const absolute = join(dir, entry);
      if (statSync(absolute).isDirectory()) visit(absolute);
      else if (entry.endsWith(".tsx")) {
        out.push(absolute.slice(process.cwd().length + 1));
      }
    }
  };
  visit(absoluteRoot);
  return out;
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

  it("keeps the filesystem public route set identical to the SEO manifest", () => {
    const filesystemRoutes = tsxFilesUnder("src/app/(public)")
      .filter((p) => p.endsWith("/page.tsx"))
      .map((path) => {
        const relative = path
          .replace(/^src\/app\/\(public\)/, "")
          .replace(/\/page\.tsx$/, "");
        return relative || "/";
      })
      .sort();
    const manifestRoutes = SEO_PUBLIC_ROUTE_ENTRIES.map((entry) => entry.path).sort();
    expect(filesystemRoutes).toEqual(manifestRoutes);
  });

  it("enforces each manifest classification in the corresponding page source", () => {
    for (const entry of SEO_PUBLIC_ROUTE_ENTRIES) {
      const file =
        entry.path === "/"
          ? "src/app/(public)/page.tsx"
          : `src/app/(public)${entry.path}/page.tsx`;
      const body = source(file);
      const indexable = body.includes("buildPublicMetadata");
      const noindex =
        body.includes("buildNoIndexMetadata") ||
        /robots\s*:\s*\{[^}]*index\s*:\s*false/s.test(body);
      expect(indexable, `${file} indexable classification mismatch`).toBe(
        entry.classification === "indexable",
      );
      expect(noindex, `${file} noindex classification mismatch`).toBe(
        entry.classification === "noindex",
      );
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

  it("prevents private child routes from reintroducing public SEO metadata", () => {
    for (const root of ["src/app/admin", "src/app/portal"]) {
      for (const path of tsxFilesUnder(root)) {
        const body = source(path);
        expect(body, `${path} must not use public SEO metadata`).not.toContain("buildPublicMetadata");
        expect(body, `${path} must not become indexable`).not.toMatch(/index\s*:\s*true/);
        expect(body, `${path} must not emit a canonical`).not.toMatch(/canonical\s*:/);
        expect(body, `${path} must not emit Open Graph metadata`).not.toMatch(/openGraph\s*:/);
        expect(body, `${path} must not emit JSON-LD`).not.toContain("application/ld+json");
        expect(body, `${path} dynamic metadata requires explicit privacy review`).not.toContain("generateMetadata");
      }
    }
  });

  it("keeps the root metadata brand-safe rather than marketing-heavy", () => {
    const body = source("src/app/layout.tsx");
    expect(body).not.toMatch(/description\s*:/);
    expect(body).not.toMatch(/openGraph\s*:/);
    expect(body).not.toMatch(/canonical\s*:/);
    expect(body).not.toContain("application/ld+json");
  });

  it("keeps the operational catalogue redirect routes non-indexable", () => {
    for (const path of [
      "src/app/(public)/countries/page.tsx",
      "src/app/(public)/visas/page.tsx",
    ]) {
      const body = source(path);
      expect(body).toContain('redirect("/login")');
      expect(body).toContain("buildNoIndexMetadata");
    }
  });
});
