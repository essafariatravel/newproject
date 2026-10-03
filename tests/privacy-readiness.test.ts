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

describe("privacy readiness regression guards", () => {
  it("keeps the public agency form minimal and document-free", () => {
    const form = read("src/app/(public)/agency/register/registration-form.tsx");
    const action = read("src/app/actions/registrations.ts");

    expect(form).not.toContain('type="file"');
    expect(form).not.toContain("commercialRegistrationNumber");
    expect(form).not.toContain("taxId");
    expect(form).not.toContain("licenceNumber");
    expect(form).not.toContain("monthlyVolume");
    expect(form).not.toContain("mainMarkets");
    expect(action).not.toContain("doc_");
    expect(action).toContain("verifyLegalVersionForAcceptance");
  });

  it("publishes legal pages only from the versioned legal store and never invents an update date", () => {
    for (const page of [
      "src/app/(public)/privacy/page.tsx",
      "src/app/(public)/terms/page.tsx",
    ]) {
      const source = read(page);
      expect(source).toContain("getPublishedLegalVersion");
      expect(source).not.toContain("settingString");
      expect(source).not.toContain("formatMonthYear(new Date()");
      expect(source).not.toMatch(/Last updated.*new Date/s);
    }
  });

  it("does not persist application data in localStorage/sessionStorage", () => {
    const files = sourceFiles(path.join(process.cwd(), "src"));
    const offenders = files.filter((file) => {
      const source = readFileSync(file, "utf8");
      return /\blocalStorage\b|\bsessionStorage\b/.test(source);
    });
    expect(offenders).toEqual([]);
  });

  it("has no analytics or advertising SDK enabled by package dependency", () => {
    const pkg = JSON.parse(read("package.json")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    const names = Object.keys(deps);
    const forbidden = names.filter((name) =>
      /@vercel\/analytics|google-analytics|gtag|segment|mixpanel|amplitude|posthog|facebook.*pixel|meta.*pixel/i.test(name),
    );
    expect(forbidden).toEqual([]);
  });

  it("keeps Terms acceptance and Privacy acknowledgement as distinct evidence", () => {
    const action = read("src/app/actions/registrations.ts");
    expect(action).toContain('action: "TERMS_ACCEPTED"');
    expect(action).toContain('action: "PRIVACY_NOTICE_ACKNOWLEDGED"');
    expect(action).toContain("termsVersionId");
    expect(action).toContain("privacyVersionId");
  });
});
