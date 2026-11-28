import Link from "next/link";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import { getSiteSettings, settingString } from "@/lib/settings";
import { publicContactDetails } from "@/lib/public-contact";
import { readBranding, brandLogoUrl } from "@/lib/branding";
import { chromeT, getUiLocale } from "@/lib/ui-i18n";
import { contentT } from "@/lib/i18n-content";
import { PublicHeader } from "@/components/public-header";
import { UiLanguageSwitcher } from "@/components/ui-language-switcher";
import { PublicMotion } from "@/components/public-motion";
import { PublicOrganizationData } from "@/components/public-organization-data";
import { TravelPhotoCredits } from "@/components/travel-photo-credits";
import { PublicLanguageLinks } from "@/components/public-language-links";
import { PUBLIC_RESOURCE_COPY } from "@/lib/public-resources";
import {
  SEO_INDEXABLE_PUBLIC_ENTRIES,
  seoLocalizedPublicPath,
  type IndexablePublicSeoPage,
} from "@/lib/seo-manifest";
import "../public-interiors.css";
import "../public-front.css";
import "@/components/public-information/information.css";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/", label: "Platform" },
  { href: "/b2b", label: "For Agencies" },
  { href: "/about", label: "About" },
  { href: "/faq", label: "FAQ" },
  { href: "/contact", label: "Contact" },
];

export default async function PublicLayout({ children }: { children: ReactNode }) {
  const settings = await getSiteSettings();
  const tagline = settingString(settings, "brand.tagline");
  const { email, phone, address, social } = publicContactDetails(settings);
  const hasContact = Boolean(email || phone || address || Object.keys(social).length);
  const branding = await readBranding();
  const brandName = branding.name;
  const logoUrl = brandLogoUrl(branding);
  const locale = await getUiLocale();
  const headerPage = (await headers()).get("x-essafaria-public-page");
  const publicPage: IndexablePublicSeoPage | undefined =
    SEO_INDEXABLE_PUBLIC_ENTRIES.find((entry) => entry.key === headerPage)?.key;
  const tr = chromeT(locale);
  const ct = contentT(locale);
  const homeTagline = "Visa management, built for travel agencies.";
  const footerTagline = !tagline || tagline === homeTagline
    ? { en: homeTagline, fr: "Gestion des visas pour les agences de voyages.", ar: "منصة لإدارة طلبات التأشيرة لوكالات السفر." }[locale]
    : ct(tagline);
  const legalLinks = {
    fr: ["Mentions légales", "Politique de cookies", "Conditions commerciales B2B"],
    en: ["Legal notice", "Cookie policy", "B2B commercial terms"],
    ar: ["البيانات القانونية", "سياسة ملفات الارتباط", "الشروط التجارية بين المهنيين"],
  }[locale];

  return (
    <div className="public-site flex min-h-screen flex-col">
      {/* Discover the critical heading font before the stylesheet is parsed.
          React 19 hoists this preload to the document head. Only marketing
          routes receive it; use one language-specific weight to avoid waste. */}
      {publicPage ? <link rel="preload" as="font" type="font/ttf" crossOrigin="anonymous"
        href={locale === "ar" ? "/fonts/IBMPlexSansArabic-SemiBold.ttf" : "/fonts/Barlow-SemiBold.ttf"} /> : null}
      <PublicOrganizationData page={publicPage} />
      <PublicMotion />
      <a className="public-skip" href="#public-main">{tr("Skip to content")}</a>
      <PublicHeader
        key={locale}
        locale={locale}
        brandName={brandName}
        homeHref={seoLocalizedPublicPath("home", locale)}
        tagline={tagline}
        logoUrl={logoUrl}
        localeSwitcher={<UiLanguageSwitcher locale={locale} publicPage={publicPage} compact />}
        nav={NAV.map((item) => ({
          href: seoLocalizedPublicPath(
            (SEO_INDEXABLE_PUBLIC_ENTRIES.find((entry) => entry.path === item.href)?.key ?? "home"),
            locale,
          ),
          label: item.label === "FAQ" ? ct("FAQ") : tr(item.label),
        }))}
        labels={{
          register: tr("Register your agency"),
          signIn: tr("Sign in"),
          menu: tr("Menu"),
          close: tr("Close menu"),
          b2b: tr("B2B Agency Portal"),
        }}
      />

      <main id="public-main" tabIndex={-1} className="flex-1">{children}</main>

      <footer className="border-t border-white/10 bg-navy-950 text-white">
        <div className={`public-footer-grid ess-container grid grid-cols-1 gap-8 py-8 sm:grid-cols-2 ${hasContact ? "with-contact lg:grid-cols-4" : "lg:grid-cols-3"}`}>
          <div>
            <p className="text-lg font-semibold text-white">{brandName}</p>
            <p className="mt-2 max-w-xs text-base leading-relaxed text-white/65">{footerTagline}</p>
          </div>
          <div>
            <p className="text-base font-semibold text-white">{tr("Platform")}</p>
            <ul className="mt-4 space-y-2 text-base">
              <li><Link prefetch={false} className="text-white/70 transition-colors hover:text-white" href={seoLocalizedPublicPath("b2b", locale)}>{tr("For Agencies")}</Link></li>
              <li><Link prefetch={false} className="text-white/70 transition-colors hover:text-white" href={seoLocalizedPublicPath("resources", locale)}>{PUBLIC_RESOURCE_COPY[locale].nav}</Link></li>
              <li><Link prefetch={false} className="text-white/70 transition-colors hover:text-white" href={`/login?lang=${locale}`}>{tr("Sign in")}</Link></li>
              <li><Link prefetch={false} className="text-white/70 transition-colors hover:text-white" href={`/agency/register?lang=${locale}`}>{tr("Register your agency")}</Link></li>
            </ul>
          </div>
          <div className="public-footer-directory">
            <div>
              <p className="text-base font-semibold text-white">{tr("Company")}</p>
              <ul className="mt-4 space-y-2 text-base">
                <li><Link prefetch={false} className="text-white/70 transition-colors hover:text-white" href={seoLocalizedPublicPath("about", locale)}>{ct("About ESSAFARIA VISA")}</Link></li>
                <li className="public-footer-extra"><Link prefetch={false} className="text-white/70 transition-colors hover:text-white" href={seoLocalizedPublicPath("faq", locale)}>{ct("FAQ")}</Link></li>
                <li><Link prefetch={false} className="text-white/70 transition-colors hover:text-white" href={seoLocalizedPublicPath("contact", locale)}>{ct("Contact")}</Link></li>
              </ul>
            </div>
            <div>
              <p className="public-footer-extra text-base font-semibold text-white">{{fr:"Informations légales", en:"Legal information", ar:"معلومات قانونية"}[locale]}</p>
              <ul className="public-footer-legal space-y-2 text-base">
                <li><Link prefetch={false} className="text-white/70 transition-colors hover:text-white" href={`/privacy?lang=${locale}`}>{ct("Privacy Notice")}</Link></li>
                <li><Link prefetch={false} className="text-white/70 transition-colors hover:text-white" href={`/terms?lang=${locale}`}>{ct("Terms of Service")}</Link></li>
                {(["legal-notice", "cookies", "commercial"] as const).map((document, index) => <li key={document}><Link prefetch={false} className="text-white/70 transition-colors hover:text-white" href={`/legal/${document}?lang=${locale}`}>{legalLinks[index]}</Link></li>)}
              </ul>
            </div>
          </div>
          {hasContact ? <div>
            <p className="text-base font-semibold text-white">{ct("Contact")}</p>
            <ul className="mt-4 space-y-2 text-base text-white/70">
              {email ? <li>{email}</li> : null}
              {phone ? <li>{phone}</li> : null}
              {address ? <li>{address}</li> : null}
            </ul>
            {Object.entries(social).filter(([, url]) => url).length > 0 ? (
              <div className="mt-4 flex gap-4 text-base">
                {Object.entries(social)
                  .filter(([, url]) => url)
                  .map(([name, url]) => (
                    <a key={name} href={url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center capitalize text-white/70 transition-colors hover:text-white">
                      {name}
                    </a>
                  ))}
              </div>
            ) : null}
          </div> : null}
        </div>
        <div className="border-t border-white/10">
          <div className="ess-container">
            <TravelPhotoCredits locale={locale} />
          </div>
          <div className="ess-container flex flex-wrap items-center justify-between gap-2 py-4 text-xs text-white/50">
            <span>© {new Date().getFullYear()} {brandName}. {tr("All rights reserved.")}</span>
            <span>{ct("Professional B2B visa operations platform.")}</span>
            {publicPage ? <PublicLanguageLinks page={publicPage} locale={locale} label={tr("Language")} /> : null}
          </div>
        </div>
      </footer>
    </div>
  );
}
