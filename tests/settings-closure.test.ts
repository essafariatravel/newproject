import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { siteSettings, auditLogs, visaTypes } from "@/db/schema";
import { createSession } from "./helpers/authenticated-session";
import { userByEmail } from "./helpers/fixtures";
import { request } from "./helpers/request";
import { suiteSetup } from "./helpers/global-state";
import { updateSetting } from "@/lib/settings";
import { saveBrandingAction, uploadBrandLogoAction, removeBrandLogoAction } from "@/app/actions/branding";
import { readBranding, setBrandLogo } from "@/lib/branding";
import { storageProvider } from "@/lib/storage";
import { updateSiteSettingsAction } from "@/app/actions/admin";
import { publishLegalContent, readPublishedLegal } from "@/lib/legal";
import SettingsPage from "@/app/admin/settings/page";
import AboutPage from "@/app/(public)/about/page";
import VisaTypePage from "@/app/admin/config/visa-types/[id]/page";

vi.mock("next/cache", () => ({revalidatePath: () => undefined}));
suiteSetup();
afterEach(async () => {
  request.cookie = "";
  await db.execute(sql`drop trigger if exists settings_audit_failure on audit_logs`);
  await db.execute(sql`drop function if exists settings_audit_failure()`);
});
async function staff() { request.cookie = (await createSession((await userByEmail("superadmin@test.example")).id)).token; }
async function actionResult(action: (form: FormData) => Promise<void>, form: FormData) {
  try { await action(form); } catch(error) {
    const digest = String((error as {digest?: string}).digest ?? error);
    if (!digest.includes("NEXT_REDIRECT")) throw error;
    return decodeURIComponent(digest);
  }
  throw new Error("Expected feedback redirect");
}
async function rejectAudit(action="SETTINGS_UPDATED") {
  if (!/^[A-Z_]+$/.test(action)) throw new Error("Invalid test action");
  await db.execute(sql.raw(`create function settings_audit_failure() returns trigger language plpgsql as $$ begin if new.action='${action}' then raise exception 'Audit unavailable'; end if; return new; end $$`));
  await db.execute(sql`create trigger settings_audit_failure before insert on audit_logs for each row execute function settings_audit_failure()`);
}

describe("honest connected settings", () => {
  it("presents one programme publication lifecycle and one publication action", async () => {
    await staff();
    const visa=(await db.select().from(visaTypes))[0]!;
    const html=renderToStaticMarkup(await VisaTypePage({params:Promise.resolve({id:visa.id}),searchParams:Promise.resolve({})}));
    // Document requirements retain their separate lifecycle; programme
    // publication has exactly one action and an explicit agency-facing state.
    expect(html).toContain("Published to agencies");
    expect((html.match(/name="toggle"/g) ?? [])).toHaveLength(1);
    expect(html).toContain("Hide from agencies");
  });
  it("shows missing owner legal content and catalogue review in the real settings page", async () => {
    await staff();
    await db.execute(sql`truncate legal_versions`);
    const html = renderToStaticMarkup(await SettingsPage({searchParams: Promise.resolve({lang:"fr"})}));
    expect(html).toContain("Contenus requis pour le lancement");
    expect(html).toContain("Versions juridiques approuvées manquantes");
    expect(html).toContain("Points à vérifier dans le catalogue");
    expect(html).not.toContain('name="brand.product"');
  });
  it("rejects invalid contact email before writing any settings", async () => {
    await staff();
    const form = new FormData(); form.set("section","content"); form.set("site.contactEmail","invalid-email"); form.set("site.address","Should not persist");
    expect(await actionResult(updateSiteSettingsAction, form)).toContain("valid contact email");
    expect((await db.select().from(siteSettings).where(eq(siteSettings.key,"site.address")))[0]?.value).not.toBe("Should not persist");
  });
  it("rolls back a content save if its mandatory audit is unavailable", async () => {
    await staff(); await updateSetting("site.address","Previous address",null); await rejectAudit();
    const form = new FormData(); form.set("section","content"); form.set("site.address","Unsaved address");
    expect(await actionResult(updateSiteSettingsAction, form)).toContain("error=");
    expect((await db.select().from(siteSettings).where(eq(siteSettings.key,"site.address")))[0]?.value).toBe("Previous address");
  });
  it("persists identity through the real action while ignoring forged visual controls", async () => {
    await staff();
    const form = new FormData(); form.set("brand.name","Owner identity"); form.set("brand.tagline","Owner tagline"); form.set("brand.primary","#ffffff");
    expect(await actionResult(saveBrandingAction, form)).toContain("Brand identity saved");
    expect((await db.select().from(siteSettings).where(eq(siteSettings.key,"brand.name")))[0]?.value).toBe("Owner identity");
    expect((await db.select().from(siteSettings).where(eq(siteSettings.key,"brand.primary")))[0]?.value).not.toBe("#ffffff");
    expect((await db.select().from(auditLogs).where(eq(auditLogs.action,"BRANDING_UPDATED"))).at(-1)?.metadata).toMatchObject({keys:["brand.name","brand.tagline"]});
  });
  it("publishes owner About text through the real content action and public page", async () => {
    await staff();
    const form = new FormData(); form.set("section","content"); form.set("public.about.en","Owner-supplied public introduction.");
    expect(await actionResult(updateSiteSettingsAction, form)).toContain("Website content saved");
    const html = renderToStaticMarkup(await AboutPage());
    expect(html).toContain("Owner-supplied public introduction.");
  });
  it("preserves the existing logo if a replacement audit cannot be saved", async () => {
    await staff();
    const before=await readBranding();
    await rejectAudit("BRANDING_LOGO_UPLOADED");
    const form=new FormData(); form.set("logo",new File([Buffer.from("89504e470d0a1a0a0000000d49484452","hex")],"logo.png",{type:"image/png"}));
    expect(await actionResult(uploadBrandLogoAction,form)).toContain("error=");
    expect((await readBranding()).logoKey).toBe(before.logoKey);
  });
  it("preserves logo settings and bytes if the removal audit cannot be saved", async () => {
    await staff();
    const bytes=Buffer.from("89504e470d0a1a0a0000000d49484452","hex");
    await setBrandLogo({data:bytes,mimeType:"image/png"},await userByEmail("superadmin@test.example"));
    const before=await readBranding();
    await rejectAudit("BRANDING_LOGO_REMOVED");
    expect(await actionResult(removeBrandLogoAction,new FormData())).toContain("error=");
    expect((await readBranding()).logoKey).toBe(before.logoKey);
    expect((await storageProvider().get(before.logoKey!)).data).toEqual(bytes);
  });
  it("does not leave a partial legal publication when a later audit fails", async () => {
    await staff();
    await db.execute(sql`create function settings_audit_failure() returns trigger language plpgsql as $$ begin if new.action='LEGAL_PUBLISHED' and new.metadata->>'kind'='privacy' then raise exception 'Audit unavailable'; end if; return new; end $$`);
    await db.execute(sql`create trigger settings_audit_failure before insert on audit_logs for each row execute function settings_audit_failure()`);
    const form = new FormData(); form.set("section","legal"); form.set("legal.terms.fr.effectiveAt","2026-09-30"); form.set("legal.privacy.fr.effectiveAt","2026-09-30"); form.set("legal.terms.fr","TEST ONLY terms awaiting atomic commit"); form.set("legal.privacy.fr","TEST ONLY privacy awaiting atomic commit");
    expect(await actionResult(updateSiteSettingsAction,form)).toContain("error=");
    const versions = await db.execute(sql`select body from legal_versions where body like 'TEST ONLY % awaiting atomic commit'`);
    expect(versions.rows).toHaveLength(0);
  });
  it("shows scheduled legal content in the editor without counting it as currently effective", async () => {
    await staff();
    await publishLegalContent({ kind:"privacy", locale:"ar", body:"TEST ONLY scheduled owner-approved notice",
      effectiveAt:new Date("2099-01-01"), actor:await userByEmail("superadmin@test.example") });
    const html=renderToStaticMarkup(await SettingsPage({searchParams:Promise.resolve({})}));
    expect(html).toContain("TEST ONLY scheduled owner-approved notice");
    expect(html).toContain('name="legal.privacy.ar.effectiveAt"');
    expect(html).toContain('value="2099-01-01"');
    expect(html).not.toContain('name="legal.publishedAt"');
    expect(await readPublishedLegal("privacy","ar")).toBeNull();
    expect(html).toContain("PRIVACY / AR");
  });
  it("offers ordinary Admin content controls while hiding SUPER_ADMIN publication controls", async () => {
    request.cookie=(await createSession((await userByEmail("admin@test.example")).id)).token;
    const html=renderToStaticMarkup(await SettingsPage({searchParams:Promise.resolve({})}));
    expect(html).toContain('name="section" value="content"');
    expect(html).not.toContain('name="section" value="legal"');
    expect(html).not.toContain('name="legal.terms.en.effectiveAt"');
    expect(html).toContain("Only SUPER_ADMIN can publish approved legal content.");
  });
});
