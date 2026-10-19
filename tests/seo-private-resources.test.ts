import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf-8");
}

const PRIVATE_DOWNLOAD_ROUTES = [
  "src/app/api/admin/applications/export/route.ts",
  "src/app/api/admin/reports/export/route.ts",
  "src/app/api/agency/wallet/export/route.ts",
  "src/app/api/agency/wallet/statement/route.ts",
  "src/app/api/documents/[id]/route.ts",
  "src/app/api/registrations/[id]/documents/[docId]/route.ts",
  "src/app/api/topups/[id]/proof/route.ts",
] as const;

describe("private resource indexation and download safety", () => {
  it("keeps every API response behind the global API noindex response header", () => {
    const config = source("next.config.ts");
    expect(config).toContain('source: "/api/:path*"');
    expect(config).toContain('"X-Robots-Tag"');
    expect(config).toContain("noindex, nofollow, noarchive");
  });

  it("requires authentication/authorization on all private download/export routes", () => {
    for (const path of PRIVATE_DOWNLOAD_ROUTES) {
      const body = source(path);
      expect(
        /getSessionUser|requireAgencyUser|requirePermission/.test(body),
        `${path} must authenticate or authorize before returning private data`,
      ).toBe(true);
    }
  });

  it("prevents caching of private download/export payloads", () => {
    for (const path of PRIVATE_DOWNLOAD_ROUTES) {
      const body = source(path);
      expect(
        /Cache-Control["']?\s*:\s*["'][^"']*no-store/i.test(body),
        `${path} must emit no-store`,
      ).toBe(true);
    }
  });

  it("serves private document-like payloads as attachments", () => {
    for (const path of [
      "src/app/api/admin/applications/export/route.ts",
      "src/app/api/admin/reports/export/route.ts",
      "src/app/api/agency/wallet/export/route.ts",
      "src/app/api/agency/wallet/statement/route.ts",
      "src/app/api/documents/[id]/route.ts",
      "src/app/api/registrations/[id]/documents/[docId]/route.ts",
      "src/app/api/topups/[id]/proof/route.ts",
    ]) {
      expect(source(path), `${path} must use attachment disposition`).toContain("Content-Disposition");
      expect(source(path), `${path} must use attachment disposition`).toContain("attachment");
    }
  });

  it("keeps token-based registration uploads private and non-cacheable", () => {
    const body = source("src/app/api/registration-followup/[token]/route.ts");
    expect(body).toContain('"Cache-Control":"private, no-store"');
    expect(body).toContain('"Referrer-Policy":"no-referrer"');
    expect(body).toContain("resolveRegistrationFollowup");
  });

  it("keeps agency logos intentionally public and narrowly bounded as brand assets", () => {
    const body = source("src/app/api/agencies/[id]/logo/route.ts");
    // The authoritative RC intentionally serves this branding asset publicly;
    // keep its UUID guard, short cache lifetime and passive-content protections.
    expect(body).toContain("Public by design");
    expect(body).toContain("UUID_RE");
    expect(body).toContain('"Cache-Control": "public, max-age=60, stale-while-revalidate=300"');
    expect(body).toContain('"Content-Security-Policy": "default-src \'none\'; sandbox"');
    expect(body).toContain('"X-Content-Type-Options": "nosniff"');
  });

  it("keeps only the platform branding logo intentionally public", () => {
    const body = source("src/app/api/branding/logo/route.ts");
    expect(body).toContain("Public by design");
    expect(body).toContain('"Cache-Control": "public, max-age=60, stale-while-revalidate=300"');
    expect(body).toContain('"Content-Security-Policy": "default-src \'none\'; sandbox"');
  });
});
