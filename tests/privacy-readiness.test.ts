import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

function read(relative: string): string {
  return readFileSync(path.join(process.cwd(), relative), "utf8");
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx|js|jsx)$/.test(name)) out.push(full);
  }
  return out;
}

describe("legal/privacy readiness regression guards", () => {
  it("keeps first-contact agency intake document-free and address-minimized", () => {
    const form = read("src/app/(public)/agency/register/registration-form.tsx");
    const action = read("src/app/actions/registrations.ts");

    expect(form).not.toContain('type="file"');
    expect(form).not.toContain('name="addressLine"');
    expect(form).not.toContain("commercialRegistrationNumber");
    expect(form).not.toContain("taxId");
    expect(form).not.toContain("licenceNumber");
    expect(form).not.toContain("monthlyVolume");
    expect(form).not.toContain("mainMarkets");
    expect(action).not.toContain('field(formData, "addressLine")');
    expect(action).toContain('action: "TERMS_ACCEPTED"');
    expect(action).toContain('action: "PRIVACY_NOTICE_ACKNOWLEDGED"');
    expect(action).toContain('"termsVersionId"');
    expect(action).toContain('"privacyVersionId"');

    const termsAt = action.indexOf('action: "TERMS_ACCEPTED"');
    const privacyAt = action.indexOf('action: "PRIVACY_NOTICE_ACKNOWLEDGED"');
    const errorHandlerAt = action.indexOf("} catch (err)", privacyAt);
    expect(action.slice(termsAt, privacyAt)).not.toContain("ipAddress:");
    expect(action.slice(privacyAt, errorHandlerAt)).not.toContain("ipAddress:");
  });

  it("uses approved legal effective dates and never fabricates deployment dates", () => {
    const legal = read("src/lib/legal.ts");
    const privacy = read("src/app/(public)/privacy/page.tsx");
    const terms = read("src/app/(public)/terms/page.tsx");

    expect(legal).toContain("effective_at");
    expect(legal).toContain("published_at");
    expect(legal).toContain('input.actor.role !== "SUPER_ADMIN"');
    expect(privacy).toContain("legal.effectiveAt");
    expect(terms).toContain("legal.effectiveAt");
    expect(privacy).not.toMatch(/formatDate\(new Date\(/);
    expect(terms).not.toMatch(/formatDate\(new Date\(/);
  });

  it("allows only the inventoried non-sensitive localStorage preference", () => {
    const files = sourceFiles(path.join(process.cwd(), "src"));
    const sessionStorageFiles: string[] = [];
    const localStorageKeys: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      if (/\bsessionStorage\b/.test(source)) sessionStorageFiles.push(file);
      for (const match of source.matchAll(/localStorage\.(?:getItem|setItem)\(["']([^"']+)["']/g)) {
        localStorageKeys.push(match[1]!);
      }
    }

    expect(sessionStorageFiles).toEqual([]);
    expect([...new Set(localStorageKeys)].sort()).toEqual(["essafaria.notification-sound"]);
  });

  it("has no common analytics or advertising SDK dependency", () => {
    const pkg = JSON.parse(read("package.json")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    const forbidden = Object.keys(deps).filter((name) =>
      /@vercel\/analytics|google-analytics|gtag|segment|mixpanel|amplitude|posthog|facebook.*pixel|meta.*pixel/i.test(name),
    );
    expect(forbidden).toEqual([]);
  });

  it("keeps public auth/login error logs code-only", () => {
    const action = read("src/app/actions/auth.ts");
    const loginPage = read("src/app/(public)/login/page.tsx");

    expect(action).toContain("safeErrorCode(err)");
    expect(loginPage).toContain("safeErrorCode(err)");
    expect(action).not.toMatch(/console\.error\([^\n]*, err\s*\)/);
    expect(loginPage).not.toMatch(/console\.error\([^\n]*, err\s*\)/);
  });

  it("keeps sensitive database schemas server-only in documented architecture", () => {
    const env = read(".env.example");
    expect(env).toContain("server-side node-postgres + Drizzle");
    expect(env).not.toMatch(/^NEXT_PUBLIC_.*(?:DATABASE|SUPABASE_SERVICE_ROLE)/m);
  });
});
