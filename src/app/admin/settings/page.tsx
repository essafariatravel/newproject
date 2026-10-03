import { pageUser } from "@/lib/page-auth";
import { hasPermission } from "@/lib/rbac";
import { getSiteSettings, settingObject, settingString } from "@/lib/settings";
import { readBranding, brandLogoUrl } from "@/lib/branding";
import { flashFrom } from "@/lib/action-helpers";
import { updateSiteSettingsAction } from "@/app/actions/admin";
import {
  saveBrandingAction,
  uploadBrandLogoAction,
  removeBrandLogoAction,
} from "@/app/actions/branding";
import { SubmitButton } from "@/components/forms";
import { BrandStudio } from "@/components/brand-studio";
import { Card, CardHeader, EmptyState, Flash, PageHeader } from "@/components/ui";
import { contentT } from "@/lib/i18n-content";
import { getUiLocale } from "@/lib/ui-i18n";
import { readPublishedLegal } from "@/lib/legal";

export const dynamic = "force-dynamic";

function dateInput(value: Date | undefined): string {
  return value ? value.toISOString().slice(0, 10) : "";
}

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const staff = await pageUser();
  if (!hasPermission(staff, "config.view")) {
    return <div className="card"><EmptyState title="Not authorized" /></div>;
  }
  const flash = flashFrom(sp);
  const settings = await getSiteSettings();
  const canManage = hasPermission(staff, "cms.manage");
  const canPublishLegal = staff.role === "SUPER_ADMIN";
  const social = settingObject(settings, "site.social");
  const uiLocale = await getUiLocale();
  const ct = contentT(uiLocale);
  const branding = await readBranding();
  const logoUrl = brandLogoUrl(branding);
  const publishedLegal = Object.fromEntries(
    await Promise.all(
      (["en", "fr", "ar"] as const).flatMap((locale) =>
        (["terms", "privacy"] as const).map(
          async (kind) =>
            [`legal.${kind}.${locale}`, await readPublishedLegal(kind, locale)] as const,
        ),
      ),
    ),
  );

  return (
    <>
      <PageHeader
        title="Brand studio & settings"
        subtitle="Make the platform yours — colors, logo, typography, shapes, content and legal copy."
      />
      <Flash {...flash} />

      {canManage ? (
        <div className="space-y-6">
          <BrandStudio
            initial={branding}
            logoUrl={logoUrl}
            saveAction={saveBrandingAction}
            uploadLogoAction={uploadBrandLogoAction}
            removeLogoAction={removeBrandLogoAction}
          />

          <form action={updateSiteSettingsAction} className="space-y-4">
            <input type="hidden" name="section" value="content" />
            <Card>
              <CardHeader title="Website content" subtitle="Public site copy and contact details." />
              <div className="grid grid-cols-1 gap-4 px-5 py-5 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="brand.product">Product name</label>
                  <input id="brand.product" name="brand.product" defaultValue={settingString(settings, "brand.product")} className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="brand.description">Short description</label>
                  <input id="brand.description" name="brand.description" defaultValue={settingString(settings, "brand.description")} className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="site.contactEmail">Contact email</label>
                  <input id="site.contactEmail" name="site.contactEmail" type="email" defaultValue={settingString(settings, "site.contactEmail")} className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="site.contactPhone">Contact phone</label>
                  <input id="site.contactPhone" name="site.contactPhone" defaultValue={settingString(settings, "site.contactPhone")} className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="site.address">Office address</label>
                  <input id="site.address" name="site.address" defaultValue={settingString(settings, "site.address")} className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="site.officeHours">Office hours</label>
                  <input id="site.officeHours" name="site.officeHours" defaultValue={settingString(settings, "site.officeHours")} className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="li">LinkedIn URL</label>
                  <input id="li" name="site.social.linkedin" defaultValue={social.linkedin ?? ""} className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="ig">Instagram URL</label>
                  <input id="ig" name="site.social.instagram" defaultValue={social.instagram ?? ""} className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="x">X / Twitter URL</label>
                  <input id="x" name="site.social.x" defaultValue={social.x ?? ""} className="input" />
                </div>
              </div>
            </Card>
            <SubmitButton className="btn-primary" pendingLabel="Saving…">
              {ct("Save website content")}
            </SubmitButton>
          </form>

          {canPublishLegal ? (
            <form action={updateSiteSettingsAction} className="space-y-4">
              <input type="hidden" name="section" value="legal" />
              <Card>
                <CardHeader
                  title="Legal publication"
                  subtitle="Publication control only — not a drafting CMS. Paste owner/legal-approved text and its approved effective date. Publication creates immutable history."
                />
                <div className="space-y-5 px-5 py-5">
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-800">
                    Only publish content that has completed the required owner/legal review. The system records the actual publication timestamp automatically; do not use a deployment date as the legal effective date.
                  </div>
                  {([
                    ["en", "English"],
                    ["fr", "Français"],
                    ["ar", "العربية"],
                  ] as const).map(([code, label]) => (
                    <div key={code} className="rounded-lg border border-ivory-200 p-4">
                      <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                      <div className="grid gap-5 xl:grid-cols-2">
                        {(["privacy", "terms"] as const).map((kind) => {
                          const legal = publishedLegal[`legal.${kind}.${code}`];
                          const title = kind === "privacy" ? "Privacy notice" : "Terms of service";
                          return (
                            <div key={kind} className="space-y-3 rounded-lg bg-ivory-50/60 p-4">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <label className="label m-0" htmlFor={`legal.${kind}.${code}`}>{title}</label>
                                {legal ? (
                                  <span className="text-[11px] text-slate-500">
                                    Current v{legal.version} · effective {dateInput(legal.effectiveAt)}
                                  </span>
                                ) : (
                                  <span className="text-[11px] font-medium text-amber-700">Not published</span>
                                )}
                              </div>
                              <textarea
                                id={`legal.${kind}.${code}`}
                                name={`legal.${kind}.${code}`}
                                rows={8}
                                dir={code === "ar" ? "rtl" : undefined}
                                defaultValue={legal?.body ?? ""}
                                className="input"
                                placeholder="Approved legal text only"
                              />
                              <div>
                                <label className="label" htmlFor={`legal.${kind}.${code}.effectiveAt`}>
                                  Approved effective date
                                </label>
                                <input
                                  id={`legal.${kind}.${code}.effectiveAt`}
                                  name={`legal.${kind}.${code}.effectiveAt`}
                                  type="date"
                                  defaultValue={dateInput(legal?.effectiveAt)}
                                  className="input"
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
              <SubmitButton className="btn-primary" pendingLabel="Publishing…">
                Publish approved legal versions
              </SubmitButton>
            </form>
          ) : (
            <Card>
              <CardHeader
                title="Legal publication"
                subtitle="Restricted to SUPER_ADMIN. Legal text is published only after the owner/legal approval process."
              />
              <div className="px-5 py-5 text-sm text-slate-600">
                Your current role can manage ordinary website content but cannot publish or supersede legal versions.
              </div>
            </Card>
          )}
        </div>
      ) : (
        <Card>
          <CardHeader title="Read-only view" subtitle="Your role cannot modify settings." />
          <div className="space-y-2 px-5 py-5 text-sm text-slate-600">
            <p>Brand: {branding.name}</p>
            <p>Contact: {settingString(settings, "site.contactEmail")} · {settingString(settings, "site.contactPhone")}</p>
          </div>
        </Card>
      )}
    </>
  );
}
