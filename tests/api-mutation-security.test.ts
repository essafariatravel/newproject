import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...routeFiles(full));
    else if (entry === "route.ts") out.push(full);
  }
  return out;
}

describe("mutating API request boundaries", () => {
  it("declares an explicit Origin policy on every mutating API route", () => {
    const root = path.join(process.cwd(), "src", "app", "api");
    const failures: string[] = [];
    for (const file of routeFiles(root)) {
      const source = readFileSync(file, "utf8");
      const mutates = /export\s+(?:async\s+)?function\s+(POST|PUT|PATCH|DELETE)\b/.test(source);
      if (!mutates) continue;
      // The retired Preview bootstrap route is a permanent 404 and performs no mutation.
      const retiredHard404 = source.includes("Retired credential bootstrap") &&
        source.includes("return notFound()") && source.includes("status: 404");
      if (retiredHard404) continue;
      if (!/headers\.get\(["']origin["']\)/.test(source)) {
        failures.push(path.relative(process.cwd(), file));
      }
    }
    expect(failures, `Mutating API routes without explicit Origin policy: ${failures.join(", ")}`).toEqual([]);
  });
});
