import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  GA4_MEASUREMENT_ID,
  GA4_PRODUCTION_HOST,
  isGa4PublicMarketingPath,
} from "../src/lib/public-analytics";

describe("GA4 public-only tracking privacy gate", () => {
  it("uses the verified property and exact production hostname", () => {
    expect(GA4_MEASUREMENT_ID).toBe("G-GZXQJW9ZHE");
    expect(GA4_PRODUCTION_HOST).toBe("visa.essafariavoyages.com");
  });

  it.each(["/", "/en", "/fr", "/ar", "/b2b", "/en/b2b", "/fr/about", "/ar/faq", "/contact"])(
    "permits only public marketing pathname %s",
    (path) => expect(isGa4PublicMarketingPath(path)).toBe(true),
  );

  it.each([
    "/login", "/agency/register", "/agency/register/success", "/forgot-password",
    "/portal", "/portal/applications", "/portal/applications/12345",
    "/admin", "/admin/agencies", "/api/applications",
    "/agency/verification/secret-token", "/reset-access/secret-token",
    "/fr/contact?email=private@example.com", "/fr/about#token",
    "/legal/cookies", "/fr/visas/passport-id",
  ])("blocks private/identifier-bearing pathname %s", (path) => {
    expect(isGa4PublicMarketingPath(path)).toBe(false);
  });

  it("keeps the analytics tag isolated from the SPA history", () => {
    const bridge = readFileSync("public/analytics-bridge.html", "utf8");
    const parent = readFileSync("src/components/ga4-consent.tsx", "utf8");
    expect(parent).not.toContain('from "next/script"');
    expect(parent).toContain("referrerPolicy=\"no-referrer\"");
    expect(parent).toContain('sandbox="allow-scripts allow-same-origin"');
    expect(parent).toContain('consent === "accepted"');
    expect(parent).toContain('src="/analytics-bridge.html"');
    expect(bridge).toContain('event.source !== window.parent');
    expect(bridge).toContain('event.origin !== ORIGIN');
    expect(bridge).toContain('send_page_view: false');
    expect(bridge).toContain('analytics_storage: "denied"');
    expect(bridge).toContain('analytics_storage: "granted"');
    expect(bridge).toContain('event.data.type !== "essafaria-ga4-page-view"');
    expect(bridge).toContain("event.data.pathname");
    expect(bridge).not.toContain("window.top.location");
  });
});
