import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("expensive export endpoint rate limits", () => {
  const routes = [
    "src/app/api/admin/applications/export/route.ts",
    "src/app/api/admin/reports/export/route.ts",
    "src/app/api/agency/wallet/export/route.ts",
    "src/app/api/agency/wallet/statement/route.ts",
  ];

  it("rate-limits every heavy export after authentication", () => {
    for (const route of routes) {
      const source = readFileSync(path.join(process.cwd(), route), "utf8");
      expect(source, `${route} must use the shared DB limiter`).toContain("consumeAuthRateLimit(");
      expect(source, `${route} must return 429 on abuse`).toContain("status: 429");
      expect(source, `${route} must tell clients when to retry`).toContain('"Retry-After": "60"');
    }
  });
});
