import Link from "next/link";
import type { ReactNode } from "react";
import { LoginWindow } from "@/components/login-window";
import { UiLanguageSwitcher } from "@/components/ui-language-switcher";
import { premiumLoginCopy } from "@/lib/premium-login-copy";
import { seoLocalizedPublicPath } from "@/lib/seo-manifest";
import type { UiLocale } from "@/lib/ui-locale-values";

export function PremiumLoginShell({ locale, logoUrl, brandName, returnPath, registerLabel, disclosure, children }: {
  locale: UiLocale;
  logoUrl: string | null;
  brandName: string;
  returnPath: string;
  registerLabel: string;
  disclosure: string;
  children: ReactNode;
}) {
  const copy = premiumLoginCopy[locale];
  const home = seoLocalizedPublicPath("home", locale);

  return (
    <div className="premium-ui premium-login" lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <header className="login-masthead">
        <Link href={home} className="login-brand">
          {logoUrl ? (
            <img className="login-custom-logo" src={logoUrl} width="1517" height="1072" alt={brandName} />
          ) : (
            <picture>
              <source media="(max-width: 680px)" srcSet="/images/essafaria-logo-header.webp" width="160" height="113" />
              <img src="/images/login/essafaria-horizontal.webp" width="612" height="187" alt="ESSAFARIA TRAVEL" />
            </picture>
          )}
          <span dir="ltr">Visa OS</span>
        </Link>
        <Link className="login-back" href={home}>{copy.back}</Link>
        <div className="login-languages-wide">
          <UiLanguageSwitcher locale={locale} nextPath={returnPath} login />
        </div>
        <div className="login-languages-small">
          <UiLanguageSwitcher key={locale} locale={locale} nextPath={returnPath} login compact />
        </div>
      </header>
      <section className="login-composition" aria-labelledby="login-welcome">
        <LoginWindow />
        <div className="login-intro">
          <h1 id="login-welcome" key={locale}>
            <span>{copy.title[0]}</span>{" "}<span>{copy.title[1]}</span>
          </h1>
          <p>{copy.introduction}</p>
        </div>
        <div className="login-controls">
          {children}
          <p className="login-register"><Link href={`/agency/register?lang=${locale}`}>{registerLabel}</Link></p>
        </div>
      </section>
      <footer className="login-colophon">
        <span dir="ltr">© ESSAFARIA TRAVEL</span>
        <p>{disclosure.replace(". ", ".\n")}</p>
      </footer>
    </div>
  );
}
