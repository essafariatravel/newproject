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

export const dynamic = "force-dynamic";

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
  const social = settingObject(settings, "site.social");
  const branding = await readBranding();
  const logoUrl = brandLogoUrl(branding);

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

            <Card>
              <CardHeader title="Legal content" subtitle="Rendered on the public /privacy and /terms pages." />
              <div className="space-y-4 px-5 py-5">
                <div>
                  <label className="label" htmlFor="legal.privacy">Privacy notice</label>
                  <textarea id="legal.privacy" name="legal.privacy" rows={5} defaultValue={settingString(settings, "legal.privacy")} className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="legal.terms">Terms of service</label>
                  <textarea id="legal.terms" name="legal.terms" rows={6} defaultValue={settingString(settings, "legal.terms")} className="input" />
                </div>
              </div>
            </Card>

            <SubmitButton className="btn-primary" pendingLabel="Saving…">Save website content</SubmitButton>
          </form>
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
