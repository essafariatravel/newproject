import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const INDEXABLE_PAGE_FILES = [
  "src/app/(public)/page.tsx",
  "src/app/(public)/b2b/page.tsx",
  "src/app/(public)/about/page.tsx",
  "src/app/(public)/contact/page.tsx",
  "src/app/(public)/faq/page.tsx",
] as const;

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf-8");
}

describe("public SEO performance guardrails", () => {
  it("keeps indexable route entrypoints as server components", () => {
    for (const path of INDEXABLE_PAGE_FILES) {
      expect(source(path), `${path} should stay server-rendered unless explicitly reviewed`).not.toMatch(/^["']use client["'];?/m);
    }
  });

  it("requires intrinsic width/height for raw public img elements", () => {
    for (const path of INDEXABLE_PAGE_FILES) {
      const body = source(path);
      for (const match of body.matchAll(/<img\b[\s\S]*?>/g)) {
        expect(match[0], `${path} image missing width`).toMatch(/\bwidth=/);
        expect(match[0], `${path} image missing height`).toMatch(/\bheight=/);
        expect(match[0], `${path} image missing alt`).toMatch(/\balt=/);
      }
    }
  });

  it("limits eager/high-priority media to a single candidate per page", () => {
    for (const path of INDEXABLE_PAGE_FILES) {
      const body = source(path);
      const highPriority = (body.match(/fetchPriority=["']high["']/g) ?? []).length;
      expect(highPriority, `${path} has too many high-priority images`).toBeLessThanOrEqual(1);
    }
  });

  it("keeps current core public imagery within a conservative payload budget", () => {
    const assets = [
      ["public/images/departure-atelier.webp", 500_000],
      ["public/images/essafaria-airport-hero.webp", 250_000],
      ["public/images/essafaria-logo.png", 200_000],
    ] as const;
    for (const [path, maxBytes] of assets) {
      expect(statSync(resolve(process.cwd(), path)).size, `${path} exceeds budget`).toBeLessThanOrEqual(maxBytes);
    }
  });

  it("does not embed base64 media or autoplay video in core indexable pages", () => {
    for (const path of INDEXABLE_PAGE_FILES) {
      const body = source(path);
      expect(body).not.toMatch(/data:image\//i);
      expect(body).not.toMatch(/<video\b/i);
      expect(body).not.toMatch(/autoPlay/i);
    }
  });
});
