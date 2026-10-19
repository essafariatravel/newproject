import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

describe("HTTP security hardening", () => {
  it("ships structural browser protections on every route", async () => {
    const rules = await nextConfig.headers?.();
    expect(rules).toBeDefined();
    const global = rules!.find((rule) => rule.source === "/:path*");
    expect(global).toBeDefined();
    const headers = Object.fromEntries(global!.headers.map((header) => [header.key, header.value]));

    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Strict-Transport-Security"]).toContain("max-age=31536000");
    expect(headers["Permissions-Policy"]).toContain("camera=()");
    expect(headers["Permissions-Policy"]).toContain("microphone=()");

    const csp = headers["Content-Security-Policy"] ?? "";
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("form-action 'self'");
  });

  it("prevents caching and referrer leakage on authenticated/token identity pages", async () => {
    const rules = await nextConfig.headers?.();
    const bySource = new Map(rules!.map((rule) => [rule.source, Object.fromEntries(rule.headers.map((header) => [header.key, header.value]))]));

    for (const source of ["/admin/:path*", "/portal/:path*", "/change-password", "/forgot-password", "/activate/:path*", "/reset-access/:path*", "/agency/verification/:path*"]) {
      expect(bySource.get(source)?.["Cache-Control"]).toContain("no-store");
      expect(bySource.get(source)?.["X-Robots-Tag"]).toContain("noindex");
    }
    for (const source of ["/change-password", "/forgot-password", "/activate/:path*", "/reset-access/:path*"]) {
      expect(bySource.get(source)?.["Referrer-Policy"]).toBe("no-referrer");
    }
  });
});
