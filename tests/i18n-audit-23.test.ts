import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Phase 2.3 — Bug 1 hard guard: no raw English JSX literals left on the
 * audited surfaces. Rules:
 *  - Every human-facing string goes through ct()/chromeT()/localizedStatusName.
 *  - Allow-list entries must end in `// ALLOW: <reason>`.
 *  - Database/user values are NEVER allowed as suppressions — only chrome.
 */

const ROOT = path.join(__dirname, "..");

const SURFACES: Record<string, string> = {
  homepage: "src/app/(public)/page.tsx",
  portalApplications: "src/app/portal/applications/page.tsx",
  portalApplicationDetail: "src/app/portal/applications/[id]/page.tsx",
  portalWallet: "src/app/portal/wallet/page.tsx",
  portalNewRequest: "src/app/portal/applications/new/page.tsx",
  adminBilling: "src/app/admin/billing/page.tsx",
  registrationPage: "src/app/(public)/agency/register/page.tsx",
  registrationSuccess: "src/app/(public)/agency/register/success/page.tsx",
};

const SHARED_COMPONENTS: Record<string, string> = {
  filterBar: "src/components/app-widgets.tsx",
  applicationDetail: "src/components/application-detail.tsx",
};

/** Raw multi-word (or capitalized) English text nodes between >…< */
const TEXT_NODE = />([^<>{}\n]*[A-Za-z][a-z]+[^<>{}\n]*)</g;
/** Raw human strings in common props */
const PROP_STRING = /(?:title|subtitle|placeholder|pendingLabel|aria-label|label)="((?:[^"\\]|\\.){4,})"/g;

function findRaw(file: string, allow: Set<string>): string[] {
  const src = readFileSync(path.join(ROOT, file), "utf8");
  // strip lines explicitly suppressed
  const lines = src.split("\n");
  const kept: string[] = [];
  lines.forEach((l) => {
    if (l.includes("// ALLOW:")) return;
    kept.push(l);
  });
  const body = kept.join("\n");
  const hits: string[] = [];
  for (const m of body.matchAll(TEXT_NODE)) {
    const txt = m[1]!.trim();
    if (txt.length < 3) continue;
    if (/^[A-Z0-9_ /·|—\-:.,()+%→←*$€£]+$/.test(txt)) continue; // acronyms/symbols
    if (allow.has(txt)) continue;
    if (txt.startsWith("{") || txt.includes("ct(") || txt.includes("t(\"")) continue;
    hits.push(txt.slice(0, 60));
  }
  for (const m of body.matchAll(PROP_STRING)) {
    const txt = m[1]!;
    if (!/[A-Za-z][a-z]+/.test(txt)) continue;
    if (txt.startsWith("!") || txt.startsWith("/")) continue; // icon/classnames
    if (allow.has(txt)) continue;
    hits.push(`prop:${txt.slice(0, 50)}`);
  }
  return [...new Set(hits)];
}

describe("Phase 2.3 — Bug 1 localization audit (hard guards)", () => {
  it("public homepage has no raw English copy outside the dictionary", () => {
    expect(findRaw(SURFACES.homepage!, new Set())).toEqual([]);
  });

  it("portal applications list: search/status/filter chrome is localized", () => {
    expect(findRaw(SURFACES.portalApplications!, new Set())).toEqual([]);
    const src = readFileSync(path.join(ROOT, SURFACES.portalApplications!), "utf8");
    expect(src).toContain("localizedStatusName"); // status options localized by code
    expect(src).toContain('label: ct("Search")');
    expect(src).toContain('label: ct("Status")');
    expect(src).toContain("locale={uiLocale}");
  });

  it("portal application detail: applicant form + panels localized", () => {
    expect(
      findRaw(SURFACES.portalApplicationDetail!, new Set(["Balance after charge", "Applicant info"])),
    ).toEqual([]);
    const src = readFileSync(path.join(ROOT, SURFACES.portalApplicationDetail!), "utf8");
    expect(src).not.toContain('<label className="label">First name *</label>');
    expect(src.match(/locale=\{uiLocale\}/g)?.length ?? 0).toBeGreaterThanOrEqual(6);
  });

  it("portal wallet: About-your-wallet paragraph localized", () => {
    expect(findRaw(SURFACES.portalWallet!, new Set())).toEqual([]);
    const src = readFileSync(path.join(ROOT, SURFACES.portalWallet!), "utf8");
    expect(src).toContain('ct("About your wallet")');
    expect(src).not.toContain('>About your wallet<');
  });

  it("back-office billing: ledger UI localized (Bug 1 named item)", () => {
    expect(findRaw(SURFACES.adminBilling!, new Set())).toEqual([]);
    const src = readFileSync(path.join(ROOT, SURFACES.adminBilling!), "utf8");
    expect(src).toContain('ct("Wallets & Billing")');
    expect(src).toContain("locale={uiLocale}");
  });

  it("new-request page: all wizard labels come through the dictionary", () => {
    expect(findRaw(SURFACES.portalNewRequest!, new Set())).toEqual([]);
    const src = readFileSync(path.join(ROOT, SURFACES.portalNewRequest!), "utf8");
    expect(src).not.toMatch(/>\s*CHOOSE\s*</);
    // Step labels are dictionary-driven; the pseudo-key "step.choose" is gone
    // because it leaked untranslated text into the rendered wizard.
    expect(src).toContain('ct("Choose visa")');
    expect(src).toContain('ct("Upload documents")');
    expect(src).toContain('ct("Preview, confirm & submit")');
    expect(src).toContain("request.error.");
  });

  it("FilterBar + Pagination chrome is dictionary-driven everywhere", () => {
    expect(findRaw(SHARED_COMPONENTS.filterBar!, new Set())).toEqual([]);
    const src = readFileSync(path.join(ROOT, SHARED_COMPONENTS.filterBar!), "utf8");
    expect(src).not.toContain('{ct("All")}</option>"');
    expect(src).toContain('contentT(props.locale ?? "en")');
    expect(src).not.toMatch(/>Filter</);
    expect(src).not.toMatch(/>Reset</);
    expect(src).not.toMatch(/← Previous|Next →/);
  });

  it("application-detail shared panels have no raw English text nodes", () => {
    expect(findRaw(SHARED_COMPONENTS.applicationDetail!, new Set())).toEqual([]);
  });

  it("registration flow pages use registrationCopy/resolveLocale (no raw hero copy)", () => {
    for (const key of ["registrationPage", "registrationSuccess"] as const) {
      const src = readFileSync(path.join(ROOT, SURFACES[key]!), "utf8");
      expect(src).toContain("registrationCopy");
      expect(src).not.toContain("function LanguageSwitcher(");
      expect(src).not.toContain("LOCALE_NAMES");
    }
  });

  it("2 MB upload rule has EN/FR/AR dictionary coverage near upload controls", () => {
    const dic = readFileSync(path.join(ROOT, "src/lib/i18n-content.ts"), "utf8");
    expect(dic).toContain('"Files must be 2 MB or smaller."');
    expect(dic).toContain("2 Mo maximum");
    expect(dic).toContain("2 ميغابايت");
    const reg = readFileSync(path.join(ROOT, "src/lib/i18n.ts"), "utf8");
    expect(reg).toContain("maximum 2 MB per file");
    expect(reg).toContain("2 Mo maximum par fichier");
    expect(reg).toContain("2 ميغابايت كحد أقصى لكل ملف");
  });
});
