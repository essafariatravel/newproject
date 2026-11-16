import { describe, expect, it } from "vitest";
import {
  assertApprovedPreviewRedirect,
  validatePreviewOrigin,
} from "../scripts/lib/preview-verifier-target";

describe("Preview verifier target safety", () => {
  const valid =
    "https://newproject-git-observability-028195-essafaria-travel-s-projects.vercel.app";

  it("accepts only a clean ESSAFARIA newproject Preview origin", () => {
    expect(validatePreviewOrigin(valid).hostname).toBe(
      "newproject-git-observability-028195-essafaria-travel-s-projects.vercel.app",
    );
    expect(validatePreviewOrigin(`${valid}/`).hostname).toContain("essafaria-travel-s-projects");
  });

  it.each([
    "https://visa.essafariavoyages.com",
    "http://newproject-git-observability-028195-essafaria-travel-s-projects.vercel.app",
    "https://attacker.vercel.app",
    "https://newproject-attacker-other-team.vercel.app",
    `${valid}/api/health`,
    `${valid}?redirect=https://attacker.example`,
    `${valid}#fragment`,
    "https://user:password@newproject-git-observability-028195-essafaria-travel-s-projects.vercel.app",
    "https://newproject-git-observability-028195-essafaria-travel-s-projects.vercel.app:8443",
  ])("rejects unsafe target %s", (url) => {
    expect(() => validatePreviewOrigin(url)).toThrow();
  });

  it("rejects redirects leaving the approved Preview host", () => {
    const approved = validatePreviewOrigin(valid).hostname;
    expect(() =>
      assertApprovedPreviewRedirect(new URL("https://attacker.example/steal"), approved),
    ).toThrow();
    expect(() =>
      assertApprovedPreviewRedirect(new URL("http://" + approved + "/downgrade"), approved),
    ).toThrow();
  });

  it("allows HTTPS redirects that stay on the exact approved host", () => {
    const approved = validatePreviewOrigin(valid).hostname;
    expect(() =>
      assertApprovedPreviewRedirect(
        new URL(`https://${approved}/api/health/live`),
        approved,
      ),
    ).not.toThrow();
  });
});
