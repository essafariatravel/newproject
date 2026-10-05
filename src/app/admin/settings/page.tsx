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
import { readLatestLegal, readPublishedLegal } from "@/lib/legal";
import { db } from "@/lib/db";
import { countries, visaTypes, visaCategories } from "@/db/schema";
import { launchContentReadiness } from "@/lib/launch-readiness";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const staff = await pageUser();
  const uiLocale = await getUiLocale(sp);
  const ct = contentT(uiLocale);
  if (!hasPermission(staff, "config.view")) {
    return <div className="card"><EmptyState title={ct("Not authorized")} /></div>;
  }
  const flash = flashFrom(sp);
  const settings = await getSiteSettings();
  const canManage = hasPermission(staff, "cms.manage");
  const canPublishLegal = canManage && staff.role === "SUPER_ADMIN";
  const social = settingObject(settings, "site.social");
  const branding = await readBranding();
  const logoUrl = brandLogoUrl(branding);
  const publishedLegal = Object.fromEntries(await Promise.all((["en","fr","ar"] as const).flatMap(locale => (["terms","privacy"] as const).map(async kind => [`legal.${kind}.${locale}`,await readPublishedLegal(kind,locale)] as const))));
  const latestLegal = Object.fromEntries(await Promise.all((["en","fr","ar"] as const).flatMap(locale => (["terms","privacy"] as const).map(async kind => [`legal.${kind}.${locale}`,await readLatestLegal(kind,locale)] as const))));
  const [countryRows, programmeRows, categoryRows] = await Promise.all([db.select().from(countries),db.select().from(visaTypes),db.select().from(visaCategories)]);
  const readiness = launchContentReadiness(settings, publishedLegal, countryRows, programmeRows, categoryRows);

  return (
    <>
      <PageHeader
        title={ct("Brand & public settings")}
        subtitle={ct("Manage identity, public contact details and owner-approved legal content.")}
      />
      <Flash {...flash} />
      <section className="mb-6 border-y border-line py-6" aria-labelledby="launch-readiness-title">
        <h2 id="launch-readiness-title" className="text-lg font-semibold text-navy-900">{ct("Launch content readiness")}</h2>
        <p className="mt-1 text-sm text-slate-600">{ct("Technical checks do not approve company facts, the launch catalogue or legal text.")}</p>
        <dl className="mt-4 space-y-4 text-sm">
          <div><dt className="font-semibold">{ct("Missing public contact details")}</dt><dd>{readiness.missingContact.length ? readiness.missingContact.map(key => ct({email:"Contact email",phone:"Contact phone",address:"Office address",officeHours:"Office hours"}[key])).join(" · ") : ct("None")}</dd></div>
          <div><dt className="font-semibold">{ct("Missing approved legal versions")}</dt><dd><bdi dir="ltr">{readiness.missingLegal.join(" · ") || ct("None")}</bdi></dd></div>
        </dl>
        {readiness.missingLegal.length ? <p role="status" className="mt-4 text-sm font-medium text-red-700">{ct("Registration is blocked in each language until its approved Terms and Privacy versions are published.")}</p> : null}
        <details className="mt-4"><summary className="cursor-pointer font-semibold">{ct("Catalogue review issues")} ({readiness.issues.length})</summary><ul className="mt-4 divide-y divide-line">{readiness.issues.map(issue => <li key={issue.id} className="py-2 text-sm"><span className="font-medium">{issue.name}</span><p className="text-slate-600">{issue.reasons.map(ct).join(" · ")}</p></li>)}</ul></details>
        <details className="mt-4"><summary className="cursor-pointer font-semibold">{ct("Owner launch checklist")}</summary><ul className="mt-4 list-disc space-y-2 ps-6 text-sm text-slate-600"><li>{ct("Confirm the registered company identity, real contact details, office address and office hours before launch.")}</li><li>{ct("Confirm the launch destinations, visa classifications, prices, processing times and document requirements.")}</li></ul></details>
      </section>

      {canManage ? (
        <div className="space-y-6">
          <BrandStudio
            initial={branding}
            logoUrl={logoUrl}
            saveAction={saveBrandingAction}
            uploadLogoAction={uploadBrandLogoAction}
            removeLogoAction={removeBrandLogoAction}
            locale={uiLocale}
          />

          <form action={updateSiteSettingsAction} className="space-y-4">
            <input type="hidden" name="section" value="content" />
            <Card>
              <CardHeader title={ct("Website content")} subtitle={ct("Public contact details and optional owner-written About copy. Empty fields are omitted from the public site.")} />
              <div className="grid grid-cols-1 gap-4 px-6 py-6 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="site.contactEmail">{ct("Contact email")}</label>
                  <input id="site.contactEmail" name="site.contactEmail" type="email" defaultValue={settingString(settings, "site.contactEmail")} className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="site.contactPhone">{ct("Contact phone")}</label>
                  <input id="site.contactPhone" name="site.contactPhone" defaultValue={settingString(settings, "site.contactPhone")} className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="site.address">{ct("Office address")}</label>
                  <input id="site.address" name="site.address" defaultValue={settingString(settings, "site.address")} className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="site.officeHours">{ct("Office hours")}</label>
                  <input id="site.officeHours" name="site.officeHours" defaultValue={settingString(settings, "site.officeHours")} className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="li">{ct("LinkedIn URL")}</label>
                  <input id="li" name="site.social.linkedin" defaultValue={social.linkedin ?? ""} className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="ig">{ct("Instagram URL")}</label>
                  <input id="ig" name="site.social.instagram" defaultValue={social.instagram ?? ""} className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="x">{ct("X / Twitter URL")}</label>
                  <input id="x" name="site.social.x" defaultValue={social.x ?? ""} className="input" />
                </div>
                {(["en","fr","ar"] as const).map(locale => <div key={locale} className="sm:col-span-2"><label className="label" htmlFor={`public.about.${locale}`}>{ct("About text")} · <bdi dir="ltr">{locale.toUpperCase()}</bdi></label><textarea id={`public.about.${locale}`} name={`public.about.${locale}`} defaultValue={settingString(settings,`public.about.${locale}`)} maxLength={2000} rows={3} dir={locale === "ar" ? "rtl" : "ltr"} className="input" /></div>)}
              </div>
            </Card>

            <SubmitButton className="btn-primary" pendingLabel={ct("Saving.")}>{ct("Save website content")}</SubmitButton>
          </form>

          {/* §Settings — legal copy has its OWN save, so editing the public site
              copy can never publish half-finished legal text (and vice versa).
              Each language is a separate field: EN/FR/AR are preserved side by
              side and the public page picks the current interface language. */}
          {canPublishLegal ? <form action={updateSiteSettingsAction} className="mt-4 space-y-4">
            <input type="hidden" name="section" value="legal" />
            <p className="text-sm text-slate-600">{ct("Publish owner-approved text only. Each change creates an immutable legal version.")}</p>
            <p className="text-sm text-slate-600">{ct("The system records the actual publication timestamp automatically.")}</p>
            <Card>
              <CardHeader title={ct("Legal content")} subtitle={ct("Rendered on the public Privacy and Terms pages in the selected language.")} />
              <div className="space-y-6 px-6 py-6">
                {([
                  ["en", "English"],
                  ["fr", "Français"],
                  ["ar", "العربية"],
                ] as const).map(([code, label]) => (
                  <div key={code} className="rounded-lg border border-ivory-200 p-4">
                    <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                    <div className="grid gap-6 xl:grid-cols-2">
                      {(["privacy","terms"] as const).map(kind => {
                        const legal = latestLegal[`legal.${kind}.${code}`];
                        return <div key={kind} className="space-y-4">
                          <label className="label" htmlFor={`legal.${kind}.${code}`}>{ct(kind === "privacy" ? "Privacy notice" : "Terms of service")}</label>
                          {legal ? <p className="text-xs text-slate-600"><bdi dir="ltr">v{legal.version} · {legal.effectiveAt.toISOString().slice(0,10)}</bdi></p> : <p className="text-xs text-slate-600">{ct("Not published")}</p>}
                          <textarea id={`legal.${kind}.${code}`} name={`legal.${kind}.${code}`} rows={6} maxLength={50_000} dir={code === "ar" ? "rtl" : "ltr"} defaultValue={legal?.body ?? ""} className="input" />
                          <label className="label" htmlFor={`legal.${kind}.${code}.effectiveAt`}>{ct("Approved effective date")}</label>
                          <input id={`legal.${kind}.${code}.effectiveAt`} name={`legal.${kind}.${code}.effectiveAt`} type="date" defaultValue={legal?.effectiveAt.toISOString().slice(0,10) ?? ""} className="input" />
                        </div>;
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
            <SubmitButton className="btn-primary" pendingLabel={ct("Saving.")}>{ct("Save legal content")}</SubmitButton>
          </form> : <Card><CardHeader title={ct("Legal content")} subtitle={ct("Only SUPER_ADMIN can publish approved legal content.")} /></Card>}
        </div>
      ) : (
        <Card>
          <CardHeader title={ct("Read-only view")} subtitle={ct("Your role cannot modify settings.")} />
          <div className="space-y-2 px-6 py-6 text-sm text-slate-600">
            <p>{ct("Brand name")}: {branding.name}</p>
            <p>{ct("Contact")}: <bdi dir="ltr">{settingString(settings, "site.contactEmail")} · {settingString(settings, "site.contactPhone")}</bdi></p>
          </div>
        </Card>
      )}
    </>
  );
}
