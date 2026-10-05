"use client";

import { SubmitButton } from "@/components/forms";
import BrandMark from "@/components/brand-mark";
import type { Branding } from "@/lib/branding";
import { contentT } from "@/lib/i18n-content";
import type { UiLocale } from "@/lib/ui-i18n";

export function BrandStudio(props: {
  initial: Branding;
  logoUrl: string | null;
  saveAction: (formData: FormData) => Promise<void>;
  uploadLogoAction: (formData: FormData) => Promise<void>;
  removeLogoAction: () => Promise<void>;
  locale?: UiLocale;
}) {
  const ct = contentT(props.locale ?? "en");
  return <div className="space-y-4">
    <form action={props.saveAction} className="card p-6">
      <h2 className="text-lg font-semibold text-navy-900">{ct("Brand identity")}</h2>
      <p className="mt-1 text-base text-slate-500">{ct("The approved palette, typography and spacing are locked for consistent, accessible screens.")}</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div><label className="label" htmlFor="brand.name">{ct("Brand name")}</label><input id="brand.name" name="brand.name" defaultValue={props.initial.name} className="input" maxLength={80} required /></div>
        <div><label className="label" htmlFor="brand.tagline">{ct("Tagline")}</label><input id="brand.tagline" name="brand.tagline" defaultValue={props.initial.tagline} className="input" maxLength={160} /></div>
      </div>
      <SubmitButton className="btn-primary mt-4" pendingLabel={ct("Saving.")}>{ct("Save branding")}</SubmitButton>
    </form>
    <div className="card p-6">
      <h2 className="text-lg font-semibold text-navy-900">{ct("Platform logo")}</h2>
      <p className="mt-1 text-base text-slate-500">{ct("PNG, JPEG or WebP up to 2 MB. Shown in the website header, portals and sign-in.")}</p>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <BrandMark className="h-16 w-20 object-contain" src={props.logoUrl} alt={ct("Platform logo")} />
        {props.logoUrl ? <form action={props.removeLogoAction}><SubmitButton className="btn-danger btn-sm" pendingLabel={ct("Removing.")}>{ct("Remove logo")}</SubmitButton></form> : null}
        <form action={props.uploadLogoAction} className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="platform-logo">{ct("Platform logo")}</label>
          <input id="platform-logo" type="file" name="logo" accept="image/png,image/jpeg,image/webp" required className="min-h-11 max-w-full text-base file:me-2 file:min-h-11 file:cursor-pointer file:rounded-md file:border-0 file:bg-iris-600 file:px-4 file:py-2 file:text-base file:font-semibold file:text-white" />
          <SubmitButton className="btn-secondary btn-sm" pendingLabel={ct("Uploading.")}>{ct("Upload logo")}</SubmitButton>
        </form>
      </div>
    </div>
  </div>;
}
