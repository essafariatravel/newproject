import { describe, expect, it } from "vitest";

/* ================= deep content localization (Phase 2.1 correction A) ============ */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { contentT, contentHas, REGISTERED_CONTENT_KEYS } from "@/lib/i18n-content";

const REQUIRED_FR = [
  ["Total applications", "Total des dossiers"],
  ["Pending intake", "Dossiers en attente"],
  ["In processing", "En traitement"],
  ["Documents in review", "Documents en vérification"],
  ["Missing documents", "Documents manquants"],
  ["Completed / approved", "Terminés / approuvés"],
  ["Rejected", "Refusés"],
  ["Active agencies", "Agences actives"],
  ["Agency registrations", "Inscriptions d'agences"],
  ["Recent applications", "Dossiers récents"],
  ["Wallet activity", "Activité des portefeuilles"],
  ["View all", "Voir tout"],
  ["Ledger", "Grand livre"],
  ["Workflow", "Flux de traitement"],
  ["Final decision", "Décision finale"],
] as const;

describe("content dictionary — the exact strings the visual review flagged", () => {
  it("fr covers every flagged admin-dashboard / app-detail string", () => {
    const t = contentT("fr");
    for (const [en, fr] of REQUIRED_FR) {
      expect(contentHas(en), `missing content key: ${en}`).toBe(true);
      expect(t(en), `untranslated: ${en}`).toBe(fr);
      expect(t(en)).not.toBe(en);
    }
  });

  it("ar covers the same surface with real Arabic", () => {
    const t = contentT("ar");
    for (const [en] of REQUIRED_FR) {
      const ar = t(en);
      expect(ar).not.toBe(en);
      expect(ar, `not Arabic script: ${en}`).toMatch(/[؀-ۿ]/);
    }
    expect(t("Total applications")).toBe("إجمالي الطلبات");
    expect(t("Final decision")).toBe("القرار النهائي");
  });

  it("every registered key carries non-empty fr AND ar", () => {
    const fr = contentT("fr");
    const ar = contentT("ar");
    for (const key of REGISTERED_CONTENT_KEYS) {
      expect(fr(key).trim().length > 0, `empty fr for ${key}`).toBe(true);
      expect(ar(key).trim().length > 0, `empty ar for ${key}`).toBe(true);
    }
  });
});

function allSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) allSourceFiles(p, acc);
    else if (/\.tsx?$/.test(e.name)) acc.push(p);
  }
  return acc;
}

describe("content threading guards (no nav-only / no raw EN literals on translated screens)", () => {
  it("every ct(\"literal\") call in src resolves to a dictionary entry", () => {
    const files = allSourceFiles("src");
    const missing: string[] = [];
    for (const f of files) {
      const s = readFileSync(f, "utf8");
      for (const m of s.matchAll(/(?<![A-Za-z_$])ct\("([^"]+)"/g)) {
        if (!contentHas(m[1]!)) missing.push(`${f}: ${m[1]}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("admin dashboard contains no raw EN KPI labels (content is ct-driven)", () => {
    const s = readFileSync("src/app/admin/page.tsx", "utf8");
    for (const frag of [
      'label="Total applications"',
      'label="Pending intake"',
      'label="In processing"',
      'label="Documents in review"',
      'label="Missing documents"',
      'label="Active agencies"',
      'label="Agency registrations"',
      'title="Recent applications"',
      'title="Wallet activity"',
      ">View all",
      ">Ledger",
    ]) {
      expect(s.includes(frag), `raw EN literal still present: ${frag}`).toBe(false);
    }
  });

  it("portal dashboard & wallet are ct-driven (no nav-only regression)", () => {
    const dash = readFileSync("src/app/portal/page.tsx", "utf8");
    const wallet = readFileSync("src/app/portal/wallet/page.tsx", "utf8");
    expect(dash.includes('title="Agency dashboard"')).toBe(false);
    expect(dash.includes('label="Active applications"')).toBe(false);
    expect(wallet.includes('title="Wallet & Transactions"')).toBe(false);
    expect(wallet.includes('label="Current balance"')).toBe(false);
  });
});
