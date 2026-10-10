import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// A static safety contract. It intentionally makes no network or database requests.
const read = (path: string) => readFileSync(resolve(path), "utf8");

describe("Hosted k6 safety policy", () => {
  it.each(["perf/k6/essafaria-load.js", "perf/k6/essafaria-exports.js"])(
    "refuses non-local targets before network calls in %s",
    (path) => {
      const source = read(path);
      expect(source).toContain("HOSTED_K6_DISABLED");
      expect(source).toContain("localhost|127");
      expect(source).toContain("i.test(BASE_URL)");
      expect(source.indexOf("HOSTED_K6_DISABLED")).toBeLessThan(source.indexOf("export function setup()"));
      expect(source.indexOf("HOSTED_K6_DISABLED")).toBeLessThan(source.indexOf("http.get("));
    },
  );

  it("guards the tier runner before the first preflight or DB snapshot", () => {
    const source = read("scripts/perf-run-tier.ts");
    expect(source).toContain("HOSTED_K6_DISABLED");
    expect(source).toContain("i.test(requestedBaseUrl)");
    expect(source.indexOf("HOSTED_K6_DISABLED")).toBeLessThan(source.indexOf("const target = assertSafePerfTarget()"));
    expect(source.indexOf("HOSTED_K6_DISABLED")).toBeLessThan(source.indexOf('run("npm", ["run", "perf:preflight"]'));
  });

  it("retains only Preview preparation and bounded runtime checks", () => {
    const source = read(".github/workflows/consolidation-preview.yml");
    expect(source).toContain("options: [prepare, runtime]");
    expect(source).toContain("npx tsx scripts/consolidation-preview.ts runtime");
    expect(source).not.toMatch(/perf:tier|perf:k6|setup-k6-action|PERF_VUS|PERF_TIER_HOLD_MINUTES/);
  });

  it("disables the legacy R9 hosted performance job", () => {
    const source = read(".github/workflows/performance-r9.yml");
    expect(source).toContain("if: $" + "{{ false }}");
  });

  it("keeps deterministic CI including security and build checks", () => {
    const source = read(".github/workflows/rc-verification.yml");
    expect(source).toContain("npm run typecheck");
    expect(source).toContain("npm run lint");
    expect(source).toContain("npm test");
    expect(source).toContain("npm run build");
  });
});
