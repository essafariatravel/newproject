import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

function filesUnder(relativeRoot: string): string[] {
  const root = resolve(process.cwd(), relativeRoot);
  const out: string[] = [];
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const absolute = join(dir, entry);
      if (statSync(absolute).isDirectory()) visit(absolute);
      else if (/\.(ts|tsx)$/.test(entry)) out.push(absolute);
    }
  };
  visit(root);
  return out;
}

function source(path: string): string {
  return readFileSync(path, "utf-8");
}

describe("repository-wide SEO metadata safety", () => {
  it("keeps direct canonical/OpenGraph construction centralized in the SEO helper", () => {
    for (const file of filesUnder("src/lib")) {
      const body = source(file);
      if (/\bopenGraph\s*:|\bcanonical\s*:/.test(body)) {
        expect(file.endsWith(join("src", "lib", "seo.ts")), `unexpected SEO metadata in ${file}`).toBe(true);
      }
    }
  });

  it("keeps metadataBase exclusively at the root layout", () => {
    for (const file of filesUnder("src/app")) {
      const body = source(file);
      if (body.includes("metadataBase")) {
        expect(file.endsWith(join("src", "app", "layout.tsx")), `unexpected metadataBase in ${file}`).toBe(true);
      }
    }
  });

  it("keeps inline JSON-LD out of the app while the security gate forbids raw HTML injection", () => {
    const jsonLdFiles = filesUnder("src/app").filter((file) =>
      source(file).includes("application/ld+json"),
    );
    expect(jsonLdFiles).toEqual([]);
    for (const file of filesUnder("src/app")) {
      expect(source(file), `${file} must not bypass the HTML-safety gate`).not.toContain(
        "dangerouslySetInnerHTML",
      );
    }
  });

  it("contains no Preview/local absolute host in metadata-bearing app files", () => {
    const metadataFiles = filesUnder("src/app").filter((file) => {
      const body = source(file);
      return /metadata|generateMetadata|application\/ld\+json/.test(body);
    });
    for (const file of metadataFiles) {
      const body = source(file);
      expect(body, `${file} contains a Preview host`).not.toMatch(/https?:\/\/[^"'\s]*\.vercel\.app/i);
      expect(body, `${file} contains localhost`).not.toMatch(/https?:\/\/localhost(?::\d+)?/i);
      expect(body, `${file} contains loopback metadata`).not.toMatch(/https?:\/\/127\.0\.0\.1(?::\d+)?/i);
    }
  });
});
