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
import { useEffect, useId, useState, type ReactNode } from "react";
import BrandMark from "@/components/brand-mark";

export interface PublicHeaderProps {
  brandName: string;
  /** Reserved for the marketing lockup — not rendered inside the app chrome. */
  tagline: string;
  logoUrl: string | null;
  /**
   * The language switcher is a SERVER component (it reads cookies), so it is
   * passed in as a pre-rendered node instead of being imported here — a client
   * component must never pull `next/headers` into the browser bundle.
   */
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

export function PublicHeader({ brandName, tagline: _tagline, logoUrl, localeSwitcher, nav, labels }: PublicHeaderProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  // The menu never survives a route change/resize race: close it when the
  // viewport grows into the desktop layout.
  useEffect(() => {
    if (!open) return;
    const onResize = () => {
      if (window.innerWidth >= 1024) setOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-white/80 backdrop-blur-xl">
      <div className="ess-container flex h-16 items-center justify-between gap-3">
        {/* Brand — logo artwork when uploaded, otherwise monogram + wordmark */}
        <Link href="/" className="flex min-w-0 shrink items-center gap-2.5" aria-label={brandName}>
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={brandName}
              className="h-10 w-auto max-w-[46vw] object-contain object-left sm:h-14 sm:max-w-[280px] rtl:object-right"
            />
          ) : (
            <>
              <BrandMark className="h-9 w-9 shrink-0" alt={brandName} />
              <span className="hidden min-w-0 leading-tight sm:block">
                <span className="block truncate text-[15px] font-bold tracking-[0.04em] text-navy-900">{brandName}</span>
                <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-gold-600">
                  {labels.b2b}
                </span>
              </span>
            </>
          )}
        </Link>

        {/* Desktop navigation */}
        <nav className="hidden items-center gap-1 lg:flex" aria-label={labels.menu}>
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full px-3.5 py-1.5 text-sm font-medium text-slate-500 transition-colors hover:bg-ivory-100 hover:text-navy-900"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          {/* Language switcher: desktop only — mobile gets it inside the menu */}
          <span className="hidden lg:inline-flex">{localeSwitcher}</span>
          <Link href="/login" className="btn-secondary btn-sm hidden lg:inline-flex">
            {labels.signIn}
          </Link>
          {/* The ONE register CTA (visible on every viewport, mobile included) */}
          <Link
            href="/agency/register"
            data-testid="public-register-cta"
            className="btn-cta btn-sm whitespace-nowrap px-3 text-xs sm:px-4 sm:text-sm"
          >
            {labels.register}
          </Link>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={open ? labels.close : labels.menu}
            data-testid="public-menu-toggle"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line/80 bg-white text-navy-900 transition-colors hover:bg-ivory-100 lg:hidden"
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
        <div id={panelId} className="border-t border-line/70 bg-white lg:hidden">
          <nav className="ess-container flex flex-col py-2" aria-label={labels.menu}>
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-xl px-2 py-3 text-sm font-medium text-slate-600 transition-colors hover:bg-ivory-100 hover:text-navy-900"
              >
                {item.label}
              </Link>
            ))}
            <div className="mt-1 flex flex-wrap items-center justify-between gap-3 border-t border-line/70 px-2 pb-3 pt-3">
              {localeSwitcher}
              <Link href="/login" className="btn-secondary btn-sm" onClick={() => setOpen(false)}>
                {labels.signIn}
              </Link>
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
