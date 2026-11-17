import Link from "next/link";
import type { ReactNode } from "react";
import type { UiLocale } from "@/lib/ui-i18n";
import { UiLanguageSwitcher } from "@/components/ui-language-switcher";
import "@/app/auth-access.css";

interface AuthAccessShellProps {
  locale: UiLocale;
  variant: "login" | "register";
  brandName: string;
  logoUrl: string | null;
  title: string;
  description: string;
  headingId: string;
  homeLabel: string;
  alternateLink: { href: string; label: string };
  disclosure?: string;
  children: ReactNode;
}

/** Presentation only. The pages and their existing forms own every action. */
export function AuthAccessShell({
  locale,
  variant,
  brandName,
  logoUrl,
  title,
  description,
  headingId,
  homeLabel,
  alternateLink,
  disclosure,
  children,
}: AuthAccessShellProps) {
  const brandLabel = brandName.replace(/\s+visa(?:\s+os)?\s*$/i, "");

  return (
    <div className={`auth-access-screen auth-access-screen--${variant}`} lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <div className="auth-access-backdrop" aria-hidden="true">
        <img src="/images/login-cloud-sky.webp" alt="" width="1920" height="1080" fetchPriority="high" />
      </div>
      <div className="auth-access-stack">
        <section className="auth-access-card" aria-labelledby={headingId}>
          <div className="auth-access-brand">
            <img className="auth-access-logo" src={logoUrl ?? "/images/essafaria-logo.png"} alt={brandName} width="112" height="80" />
            <div className="auth-access-wordmark" aria-hidden="true">
              <span>{brandLabel}</span>
              <span className="auth-access-product">VISA OS</span>
            </div>
          </div>

          <header className="auth-access-intro">
            <h1 id={headingId}>{title}</h1>
            <p>{description}</p>
          </header>

          {children}

          <footer className="auth-access-footer">
            <div className="auth-access-links">
              <Link href="/">{homeLabel}</Link>
              <Link href={alternateLink.href}>{alternateLink.label}</Link>
            </div>
            <div className="auth-access-languages">
              <UiLanguageSwitcher locale={locale} nextPath={variant === "login" ? "/login" : "/agency/register"} />
            </div>
          </footer>
        </section>
        {disclosure ? <p className="auth-access-disclosure">{disclosure}</p> : null}
      </div>
    </div>
  );
}
