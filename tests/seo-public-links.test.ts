import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SEO_PUBLIC_ROUTE_ENTRIES, SEO_PRIVATE_ROUTE_PREFIXES } from "@/lib/seo-manifest";

function filesUnder(relativeRoot: string): string[] {
  const root = resolve(process.cwd(), relativeRoot);
  const out: string[] = [];
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const absolute = join(dir, entry);
      if (statSync(absolute).isDirectory()) visit(absolute);
      else if (/\.(tsx|ts)$/.test(entry)) out.push(absolute);
    }
  };
  visit(root);
  return out;
}

function literalInternalHrefs(source: string): string[] {
  const results: string[] = [];
  for (const match of source.matchAll(/href\s*=\s*["'](\/[^"'<>]*)["']/g)) {
    results.push(match[1]);
  }
  return results;
}

describe("public internal links", () => {
  const knownStaticPaths = new Set(
    SEO_PUBLIC_ROUTE_ENTRIES
      .map((entry) => entry.path)
      .filter((path) => !path.includes("[")),
  );

  it("does not link public pages directly into private Admin/Portal/API surfaces", () => {
    for (const file of filesUnder("src/app/(public)")) {
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
    const files = [
      ...filesUnder("src/app/(public)"),
      resolve(process.cwd(), "src/components/public-header.tsx"),
    ];
    for (const file of files) {
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
