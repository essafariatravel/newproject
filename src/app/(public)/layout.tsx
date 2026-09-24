import Link from "next/link";
import type { ReactNode } from "react";
import { getSiteSettings, settingObject, settingString } from "@/lib/settings";
import { readBranding, brandLogoUrl } from "@/lib/branding";
import { chromeT, getUiLocale } from "@/lib/ui-i18n";
import { PublicHeader } from "@/components/public-header";
import { UiLanguageSwitcher } from "@/components/ui-language-switcher";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/visas", label: "Visa Services" },
  { href: "/countries", label: "Destinations" },
  { href: "/b2b", label: "For Agencies" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export default async function PublicLayout({ children }: { children: ReactNode }) {
  const settings = await getSiteSettings();
  const brandName = settingString(settings, "brand.name", "ESSAFARIA TRAVEL");
  const tagline = settingString(settings, "brand.tagline");
  const email = settingString(settings, "site.contactEmail");
  const phone = settingString(settings, "site.contactPhone");
  const address = settingString(settings, "site.address");
  const social = settingObject(settings, "site.social");
  const branding = await readBranding();
  const logoUrl = brandLogoUrl(branding);
  const locale = await getUiLocale();
  const tr = chromeT(locale);

  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader
        brandName={brandName}
        tagline={tagline}
        logoUrl={logoUrl}
        localeSwitcher={<UiLanguageSwitcher locale={locale} compact />}
        nav={NAV.map((item) => ({ href: item.href, label: tr(item.label) }))}
        labels={{
          register: tr("Register your agency"),
          signIn: tr("Sign in"),
          menu: tr("Menu"),
          close: tr("Close menu"),
          b2b: tr("B2B Agency Portal"),
        }}
      />

      <main className="flex-1">{children}</main>

      <footer className="mt-20 border-t border-line/80 bg-white/70">
        <div className="ess-container grid grid-cols-1 gap-10 py-12 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-lg font-bold tracking-[0.04em] text-navy-900">{brandName}</p>
            <p className="mt-2 max-w-xs text-sm leading-relaxed text-slate-500">{tagline}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">{tr("Platform")}</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li><Link className="text-slate-600 transition-colors hover:text-navy-900" href="/visas">{tr("Visa Services")}</Link></li>
              <li><Link className="text-slate-600 transition-colors hover:text-navy-900" href="/countries">{tr("Destinations")}</Link></li>
              <li><Link className="text-slate-600 transition-colors hover:text-navy-900" href="/b2b">{tr("B2B Services")}</Link></li>
              <li><Link className="text-slate-600 transition-colors hover:text-navy-900" href="/login">Agency & Staff Login</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">{tr("Company")}</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li><Link className="text-slate-600 transition-colors hover:text-navy-900" href="/about">About ESSAFARIA</Link></li>
              <li><Link className="text-slate-600 transition-colors hover:text-navy-900" href="/contact">Contact</Link></li>
              <li><Link className="text-slate-600 transition-colors hover:text-navy-900" href="/privacy">Privacy Notice</Link></li>
              <li><Link className="text-slate-600 transition-colors hover:text-navy-900" href="/terms">Terms of Service</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">Contact</p>
            <ul className="mt-3 space-y-2 text-sm text-slate-500">
              <li>{email}</li>
              <li>{phone}</li>
              <li>{address}</li>
            </ul>
            {Object.entries(social).filter(([, url]) => url).length > 0 ? (
              <div className="mt-3 flex gap-3 text-sm">
                {Object.entries(social)
                  .filter(([, url]) => url)
                  .map(([name, url]) => (
                    <a key={name} href={url} target="_blank" rel="noopener noreferrer" className="capitalize text-slate-600 transition-colors hover:text-navy-900">
                      {name}
                    </a>
                  ))}
              </div>
            ) : null}
          </div>
        </div>
        <div className="border-t border-line/80">
          <div className="ess-container flex flex-wrap items-center justify-between gap-2 py-4 text-xs text-slate-400">
            <span>© {new Date().getFullYear()} {brandName}. {tr("All rights reserved.")}</span>
            <span>Professional B2B visa operations platform.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
