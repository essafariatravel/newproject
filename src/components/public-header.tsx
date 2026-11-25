"use client";

/**
 * Public site header (§50).
 *
 * Mobile contract, verified by tests:
 *   - EXACTLY ONE visible "Register your agency" CTA at mobile widths — the
 *     CTA lives in the top bar only; the opened menu never repeats it,
 *   - a single coherent responsive header: brand on one line, one compact
 *     action group, and a hamburger that opens the navigation,
 *   - NO horizontally scrolling nav strip: nothing at mobile is wider than
 *     the viewport (no horizontal page overflow).
 *
 * Desktop keeps the editorial layout: inline nav, language switcher, sign in.
 */
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { UiLocale } from "@/lib/ui-locale-values";
import { PublicActionLabel } from "./public-action-label";
import { UiLanguageSwitcher } from "./ui-language-switcher";
import { supportsPublicLanguageQuery } from "@/lib/public-locale";
import { seoIndexablePageForPath } from "@/lib/seo-manifest";

export interface PublicHeaderProps {
  locale: UiLocale;
  brandName: string;
  homeHref?: string;
  /** Reserved for the marketing lockup — not rendered inside the app chrome. */
  tagline: string;
  logoUrl: string | null;
  /** Server-rendered locale controls used outside the public marketing and form routes. */
  localeSwitcher: ReactNode;
  nav: { href: string; label: string }[];
  labels: {
    register: string;
    signIn: string;
    menu: string;
    close: string;
    b2b: string;
  };
}

export function PublicHeader({ locale, brandName, homeHref = "/", tagline: _tagline, logoUrl, localeSwitcher, nav, labels }: PublicHeaderProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const pathname = usePathname();
  const query = useSearchParams();
  const queryPage = supportsPublicLanguageQuery(pathname) && pathname !== "/login";
  const marketingPage = seoIndexablePageForPath(pathname.replace(/^\/(?:fr|ar)(?=\/|$)/, "") || "/");
  const publicLockup = queryPage || Boolean(marketingPage);
  const registration = pathname === "/agency/register" || pathname === "/agency/register/success";
  const reference = pathname === "/agency/register/success" ? query.get("ref") : null;
  const receiptReference = reference && /^AGR-\d{4}-[A-Z0-9]{6}$/.test(reference) ? reference : undefined;
  // Keep the registration form mounted on language change. Other public forms
  // use a same-document GET, which works with their no-referrer policy.
  const isRegistrationForm = pathname === "/agency/register";
  const languages = publicLockup ? (
    <UiLanguageSwitcher locale={locale} compact publicPage={marketingPage ?? undefined}
      nextPath={isRegistrationForm ? pathname : undefined} sameDocument={queryPage && !isRegistrationForm}
      receiptReference={receiptReference} />
  ) : localeSwitcher;
  const toggle = useRef<HTMLButtonElement>(null);

  // The menu never survives a route change/resize race: close it when the
  // viewport grows into the desktop layout.
  useEffect(() => {
    if (!open) return;
    const onResize = () => {
      if (window.innerWidth >= 1280) setOpen(false);
    };
    window.addEventListener("resize", onResize);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        toggle.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <header className={`premium-public-header sticky top-0 z-40 border-b border-white/10 bg-navy-950 text-white${publicLockup ? " home-header" : ""}`}>
      <div className="ess-container flex h-16 items-center justify-between gap-2">
        {/* Brand — logo artwork when uploaded, otherwise monogram + wordmark */}
        <Link href={homeHref} className="platform-brand flex min-w-0 shrink items-center gap-2" aria-label={brandName}>
          {publicLockup ? (
            <>
              {logoUrl ? (
                <img className="home-configured-logo" src={logoUrl} alt="" width="126" height="42" />
              ) : (
                <picture>
                  <source media="(max-width: 680px)" srcSet="/images/essafaria-logo-header.webp" width="160" height="113" />
                  <img src="/images/login/essafaria-horizontal.webp" alt="" width="612" height="187" />
                </picture>
              )}
              <span className="home-brand-name">
                <b dir="ltr">Visa OS</b>
                <small>{labels.b2b}</small>
              </span>
            </>
          ) : logoUrl ? (
            <img
              src={logoUrl}
              alt={brandName}
              className="h-10 w-auto max-w-[46vw] object-contain object-left sm:h-14 sm:max-w-[280px] rtl:object-right"
            />
          ) : (
            <>
              <img src="/images/essafaria-logo-header.webp" alt="" width="80" height="57" className="platform-mark shrink-0 object-contain" />
              <span className="hidden min-w-0 leading-tight sm:block">
                <span className="block truncate text-base font-semibold text-white">{brandName}</span>
                <span className="block truncate text-xs text-white/75">
                  {labels.b2b}
                </span>
              </span>
            </>
          )}
        </Link>

        {/* Desktop navigation */}
        <nav className="public-desktop-nav hidden items-center gap-2 lg:flex" aria-label={labels.menu}>
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={pathname === item.href ? "page" : undefined}
              className="inline-flex min-h-11 items-center rounded-lg px-4 text-base font-semibold text-white/75 transition-colors hover:bg-white/10 hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="platform-access flex shrink-0 items-center gap-2">
          {/* Language switcher: desktop only — mobile gets it inside the menu */}
          <span className="public-desktop-controls hidden xl:inline-flex">{languages}</span>
          {registration ? (
            <Link href={`/login?lang=${locale}`} className="btn btn-sm public-partner-action whitespace-nowrap px-4 text-base">
              <PublicActionLabel locale={locale}>{labels.signIn}</PublicActionLabel>
            </Link>
          ) : (
            <>
              <span className="public-desktop-controls hidden xl:inline-flex">
                <Link href={`/login?lang=${locale}`} className="btn btn-sm platform-sign-in">
                  {publicLockup ? <PublicActionLabel locale={locale}>{labels.signIn}</PublicActionLabel> : labels.signIn}
                </Link>
              </span>
              <Link
                href={`/agency/register?lang=${locale}`}
                data-testid="public-register-cta"
                className="btn-gold btn-sm public-partner-action whitespace-nowrap px-4 text-base"
              >
                {publicLockup ? <PublicActionLabel locale={locale}>{labels.register}</PublicActionLabel> : labels.register}
              </Link>
            </>
          )}
          <button
            ref={toggle}
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={open ? labels.close : labels.menu}
            data-testid="public-menu-toggle"
            className="public-mobile-toggle inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/25 bg-transparent text-white transition-colors hover:bg-white/10 lg:hidden"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              {open ? (
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile / tablet navigation panel — no register CTA here (one only) */}
      {open ? (
        <div id={panelId} className="public-menu-panel border-t border-white/10 bg-navy-950 xl:hidden">
          <nav className="ess-container flex flex-col py-2" aria-label={labels.menu}>
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={pathname === item.href ? "page" : undefined}
                onClick={() => setOpen(false)}
                className="inline-flex min-h-11 items-center rounded-lg px-2 text-base font-semibold text-white/80 transition-colors hover:bg-white/10 hover:text-white"
              >
                {item.label}
              </Link>
            ))}
            <div className="mt-2 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 px-2 pb-4 pt-4">
              {languages}
              {registration ? null : <Link href={`/login?lang=${locale}`} className="btn btn-sm platform-sign-in border border-white/35 bg-transparent text-white" onClick={() => setOpen(false)}>
                {publicLockup ? <PublicActionLabel locale={locale}>{labels.signIn}</PublicActionLabel> : labels.signIn}
              </Link>}
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
