import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SEO_PUBLIC_ROUTE_ENTRIES, SEO_PRIVATE_ROUTE_PREFIXES } from "@/lib/seo-manifest";

function literalInternalHrefs(source: string): string[] {
  const results: string[] = [];
  for (const match of source.matchAll(/href\s*=\s*["'](\/[^"'<>]*)["']/g)) {
    results.push(match[1]);
  }
  return results;
}

describe("public internal links", () => {
  const CORE_PUBLIC_FILES = [
    resolve(process.cwd(), "src/app/(public)/page.tsx"),
    resolve(process.cwd(), "src/app/(public)/b2b/page.tsx"),
    resolve(process.cwd(), "src/app/(public)/about/page.tsx"),
    resolve(process.cwd(), "src/app/(public)/contact/page.tsx"),
    resolve(process.cwd(), "src/app/(public)/faq/page.tsx"),
    resolve(process.cwd(), "src/app/(public)/layout.tsx"),
    resolve(process.cwd(), "src/components/public-header.tsx"),
  ];

  const knownStaticPaths = new Set(
    SEO_PUBLIC_ROUTE_ENTRIES
      .map((entry) => entry.path)
      .filter((path) => !path.includes("[")),
  );

  it("does not link public pages directly into private Admin/Portal/API surfaces", () => {
    for (const file of CORE_PUBLIC_FILES) {
      const body = readFileSync(file, "utf-8");
      for (const href of literalInternalHrefs(body)) {
        const pathname = href.split(/[?#]/, 1)[0];
        expect(
          SEO_PRIVATE_ROUTE_PREFIXES.some(
            (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
          ),
          `${file} links directly to private surface ${href}`,
        ).toBe(false);
      }
    }
  });

  it("keeps literal public links pointed at real static route pages", () => {
    for (const file of CORE_PUBLIC_FILES) {
      const body = readFileSync(file, "utf-8");
      for (const href of literalInternalHrefs(body)) {
        const pathname = href.split(/[?#]/, 1)[0];
        if (!pathname || pathname === "/") continue;
        expect(
          knownStaticPaths.has(pathname),
          `${file} contains literal internal link to unknown public route ${href}`,
        ).toBe(true);
      }
    }
  });
});
