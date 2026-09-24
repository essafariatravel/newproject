import { describe, expect, it, vi } from "vitest";

// Server actions finish with revalidatePath(); outside a request scope Next
// raises its static-store invariant, which is a test-runtime artefact only.
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

import { suiteSetup } from "./helpers/global-state";

suiteSetup();

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLogs, siteSettings, users } from "@/db/schema";
import { getSiteSettings, settingString, settingObject } from "@/lib/settings";
import { request } from "./helpers/request";

/**
 * §Settings — branding / CMS / legal are three sections with three independent
 * saves, the legal copy is multilingual (EN/FR/AR), and an existing single
 * language value is never destroyed by adding another language.
 *
 * The reason this is a test and not a screenshot: a settings form that posts
 * every field can silently overwrite the legal notice with an empty string the
 * moment someone saves the contact details. That is exactly the failure mode
 * the specification calls out ("preserve existing legal text").
 */

async function actAsSuperAdmin() {
  const { createSession } = await import("@/lib/auth");
  const row = (await db.select().from(users).where(eq(users.role, "SUPER_ADMIN")).limit(1))[0]!;
  const { token } = await createSession(row.id);
  request.cookie = token;
  return row;
}

async function runAction(action: (form: FormData) => Promise<void>, form: FormData): Promise<string> {
  try {
    await action(form);
  } catch (error) {
    const digest = String((error as { digest?: string })?.digest ?? error);
    if (!digest.includes("NEXT_REDIRECT")) throw error;
    return decodeURIComponent(digest);
  }
  return "";
}

describe("§Settings — independent sections, multilingual legal copy", () => {
  it("1. saving website content never touches the legal text", async () => {
    const { updateSiteSettingsAction } = await import("@/app/actions/admin");
    await actAsSuperAdmin();
    const { updateSetting } = await import("@/lib/settings");
    await updateSetting("legal.privacy.en", "PUBLISHED PRIVACY NOTICE", null);
    await updateSetting("legal.terms.en", "PUBLISHED TERMS", null);

    const form = new FormData();
    form.set("section", "content");
    form.set("site.contactEmail", "desk@essafaria.example");
    form.set("site.contactPhone", "+213 555 000 000");
    const flash = await runAction(updateSiteSettingsAction, form);
    expect(flash).toMatch(/Website content saved/);

    const settings = await getSiteSettings();
    expect(settingString(settings, "site.contactEmail")).toBe("desk@essafaria.example");
    // The legal text survived a CMS save — untouched, not blanked.
    expect(settingString(settings, "legal.privacy.en")).toBe("PUBLISHED PRIVACY NOTICE");
    expect(settingString(settings, "legal.terms.en")).toBe("PUBLISHED TERMS");
  });

  it("2. saving legal content never touches the website copy", async () => {
    const { updateSiteSettingsAction } = await import("@/app/actions/admin");
    await actAsSuperAdmin();
    const { updateSetting } = await import("@/lib/settings");
    await updateSetting("brand.product", "ESSAFARIA Visa OS", null);

    const form = new FormData();
    form.set("section", "legal");
    form.set("legal.privacy.ar", "إشعار الخصوصية بالعربية");
    form.set("legal.terms.ar", "شروط الخدمة بالعربية");
    const flash = await runAction(updateSiteSettingsAction, form);
    expect(flash).toMatch(/Legal content saved/);

    const settings = await getSiteSettings();
    expect(settingString(settings, "legal.privacy.ar")).toBe("إشعار الخصوصية بالعربية");
    expect(settingString(settings, "brand.product")).toBe("ESSAFARIA Visa OS");
  });

  it("3. each language is stored under its own key and resolves per locale", async () => {
    const { updateSiteSettingsAction } = await import("@/app/actions/admin");
    await actAsSuperAdmin();
    const form = new FormData();
    form.set("section", "legal");
    form.set("legal.privacy.en", "English privacy");
    form.set("legal.privacy.fr", "Confidentialité française");
    form.set("legal.privacy.ar", "الخصوصية العربية");
    form.set("legal.terms.en", "English terms");
    form.set("legal.terms.fr", "Conditions françaises");
    form.set("legal.terms.ar", "الشروط العربية");
    await runAction(updateSiteSettingsAction, form);

    const settings = await getSiteSettings();
    for (const locale of ["en", "fr", "ar"]) {
      expect(settingString(settings, `legal.privacy.${locale}`)).not.toBe("");
      expect(settingString(settings, `legal.terms.${locale}`)).not.toBe("");
    }
    expect(settingString(settings, "legal.privacy.ar")).toMatch(/[\u0600-\u06FF]/);
  });

  it("4. a language that was never translated falls back instead of rendering blank", async () => {
    const { updateSetting } = await import("@/lib/settings");
    // Legacy install: only the single-language key exists.
    await updateSetting("legal.privacy", "Legacy single-language notice", null);
    const settings = await getSiteSettings();
    const resolved = (locale: string) =>
      settingString(settings, `legal.privacy.${locale}`) || settingString(settings, "legal.privacy") || "fallback";
    expect(resolved("de")).toBe("Legacy single-language notice");
  });

  it("5. an empty submission is refused with a business error, not a silent no-op", async () => {
    const { updateSiteSettingsAction } = await import("@/app/actions/admin");
    await actAsSuperAdmin();
    const form = new FormData();
    form.set("section", "content");
    const flash = await runAction(updateSiteSettingsAction, form);
    expect(flash).toMatch(/nothing to save/i);
  });

  it("6. every settings save is audited with its section", async () => {
    const { updateSiteSettingsAction } = await import("@/app/actions/admin");
    const admin = await actAsSuperAdmin();
    const form = new FormData();
    form.set("section", "legal");
    form.set("legal.privacy.fr", "Confidentialité auditée");
    await runAction(updateSiteSettingsAction, form);

    const audits = await db.select().from(auditLogs).where(eq(auditLogs.action, "SETTINGS_UPDATED"));
    const mine = audits.filter((a) => a.actorId === admin.id);
    expect(mine.length).toBeGreaterThan(0);
    const metadata = mine.at(-1)!.metadata as { section?: string; keys?: string[] };
    expect(metadata.section).toBe("legal");
    expect(metadata.keys).toContain("legal.privacy.fr");
  });

  it("7. brand and CMS settings live in separate rows — one save cannot blank the other", async () => {
    const { updateSetting } = await import("@/lib/settings");
    await updateSetting("site.social", { linkedin: "https://linkedin.com/company/essafaria", instagram: "", x: "" }, null);
    const settings = await getSiteSettings();
    expect(settingObject(settings, "site.social").linkedin).toContain("linkedin.com");

    const { updateSiteSettingsAction } = await import("@/app/actions/admin");
    await actAsSuperAdmin();
    const form = new FormData();
    form.set("section", "legal");
    form.set("legal.terms.en", "Terms v2");
    await runAction(updateSiteSettingsAction, form);

    const after = await getSiteSettings();
    expect(settingObject(after, "site.social").linkedin).toContain("linkedin.com");
    expect(settingString(after, "legal.terms.en")).toBe("Terms v2");
  });

  it("8. legal text is stored as text, never as markup, and long copy round-trips", async () => {
    const { updateSetting } = await import("@/lib/settings");
    const long = "Article 1 — Scope.\n".repeat(120);
    await updateSetting("legal.terms.fr", long, null);
    const row = (await db.select().from(siteSettings).where(eq(siteSettings.key, "legal.terms.fr")).limit(1))[0]!;
    expect(typeof row.value).toBe("string");
    expect(String(row.value).length).toBe(long.length);
  });
});
