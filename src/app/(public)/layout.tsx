import Link from "next/link";
import type { ReactNode } from "react";
import { getSiteSettings, settingObject, settingString } from "@/lib/settings";
import { readBranding, brandLogoUrl } from "@/lib/branding";
import { chromeT, getUiLocale } from "@/lib/ui-i18n";
import { contentT } from "@/lib/i18n-content";
import { PublicHeader } from "@/components/public-header";
import { UiLanguageSwitcher } from "@/components/ui-language-switcher";
import { PublicMotion } from "@/components/public-motion";

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
  const tagline = settingString(settings, "brand.tagline");
  const email = settingString(settings, "site.contactEmail");
  const phone = settingString(settings, "site.contactPhone");
  const address = settingString(settings, "site.address");
  const social = settingObject(settings, "site.social");
  const branding = await readBranding();
  const brandName = branding.name;
  const logoUrl = brandLogoUrl(branding);
  const locale = await getUiLocale();
  const tr = chromeT(locale);
  const ct = contentT(locale);

  return (
    <div className="public-site flex min-h-screen flex-col">
      <PublicMotion />
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

      <footer className="border-t border-white/10 bg-navy-950 text-white">
        <div className="ess-container grid grid-cols-1 gap-10 py-12 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-lg font-bold tracking-[0.04em] text-white">{brandName}</p>
            <p className="mt-2 max-w-xs text-sm leading-relaxed text-white/65">{tagline}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-gold-400">{tr("Platform")}</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li><Link className="text-white/70 transition-colors hover:text-white" href="/visas">{tr("Visa Services")}</Link></li>
              <li><Link className="text-white/70 transition-colors hover:text-white" href="/countries">{tr("Destinations")}</Link></li>
              <li><Link className="text-white/70 transition-colors hover:text-white" href="/b2b">{tr("B2B Services")}</Link></li>
              <li><Link className="text-white/70 transition-colors hover:text-white" href="/login">{ct("Agency & Staff Login")}</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-gold-400">{tr("Company")}</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li><Link className="text-white/70 transition-colors hover:text-white" href="/about">{ct("About ESSAFARIA VISA")}</Link></li>
              <li><Link className="text-white/70 transition-colors hover:text-white" href="/contact">{ct("Contact")}</Link></li>
              <li><Link className="text-white/70 transition-colors hover:text-white" href="/privacy">{ct("Privacy Notice")}</Link></li>
              <li><Link className="text-white/70 transition-colors hover:text-white" href="/terms">{ct("Terms of Service")}</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-gold-400">{ct("Contact")}</p>
            <ul className="mt-3 space-y-2 text-sm text-white/70">
              <li>{email}</li>
              <li>{phone}</li>
              <li>{address}</li>
            </ul>
            {Object.entries(social).filter(([, url]) => url).length > 0 ? (
              <div className="mt-3 flex gap-3 text-sm">
                {Object.entries(social)
                  .filter(([, url]) => url)
                  .map(([name, url]) => (
                    <a key={name} href={url} target="_blank" rel="noopener noreferrer" className="capitalize text-white/70 transition-colors hover:text-white">
                      {name}
                    </a>
                  ))}
              </div>
            ) : null}
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className="ess-container flex flex-wrap items-center justify-between gap-2 py-4 text-xs text-white/50">
            <span>© {new Date().getFullYear()} {brandName}. {tr("All rights reserved.")}</span>
            <span>{ct("Professional B2B visa operations platform.")}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
