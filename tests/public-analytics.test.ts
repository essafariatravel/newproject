import { describe, expect, it } from "vitest";
import {
  GA4_MEASUREMENT_ID,
  GA4_PRODUCTION_HOST,
  isGa4PublicMarketingPath,
} from "../src/lib/public-analytics";

describe("GA4 public-only tracking privacy gate", () => {
  it("uses the explicitly verified property and canonical Production hostname", () => {
    expect(GA4_MEASUREMENT_ID).toBe("G-GZXQJW9ZHE");
    expect(GA4_PRODUCTION_HOST).toBe("visa.essafariavoyages.com");
  });

  it.each(["/", "/en", "/fr", "/ar", "/b2b", "/en/b2b", "/fr/about", "/ar/faq", "/contact"])(
    "allows canonical public marketing pathname %s",
    (path) => expect(isGa4PublicMarketingPath(path)).toBe(true),
  );

  it.each([
    "/login", "/agency/register", "/agency/register/success", "/forgot-password",
    "/portal", "/portal/applications", "/portal/applications/12345",
    "/admin", "/admin/agencies", "/api/applications",
    "/agency/verification/secret-token", "/reset-access/secret-token",
    "/fr/contact?email=private@example.com", "/fr/about#token",
    "/legal/cookies", "/fr/visas/passport-id",
  ])("never tracks confidential / identifier-bearing pathname %s", (path) => {
    expect(isGa4PublicMarketingPath(path)).toBe(false);
  });
});
