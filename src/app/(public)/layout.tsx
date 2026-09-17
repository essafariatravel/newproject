import Link from "next/link";
import type { ReactNode } from "react";
import { getSiteSettings, settingObject, settingString } from "@/lib/settings";
import BrandMark from "@/components/brand-mark";

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

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-line/70 bg-white/70 backdrop-blur-xl">
        <div className="ess-container flex h-16 items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5">
            <BrandMark />
            <span className="leading-tight">
              <span className="block text-[15px] font-bold tracking-[0.04em] text-navy-900">
                {brandName}
              </span>
              <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-gold-600">
                Visa Operations
              </span>
            </span>
          </Link>
          <nav className="hidden items-center gap-1 lg:flex">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-full px-3.5 py-1.5 text-sm font-medium text-slate-500 transition-colors hover:bg-ivory-100 hover:text-navy-900"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="btn-secondary btn-sm sm:px-4 sm:py-2 sm:text-sm">
              Sign in
            </Link>
            <Link href="/b2b#partner" className="btn-primary btn-sm sm:px-4 sm:py-2 sm:text-sm">
              Partner with us
            </Link>
          </div>
        </div>
        <nav className="flex gap-4 overflow-x-auto border-t border-line/70 bg-white/60 px-4 py-2.5 lg:hidden">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="whitespace-nowrap text-xs font-medium text-slate-500">
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="mt-20 border-t border-line/80 bg-white/70">
        <div className="ess-container grid grid-cols-1 gap-10 py-12 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-lg font-bold tracking-[0.04em] text-navy-900">{brandName}</p>
            <p className="mt-2 max-w-xs text-sm leading-relaxed text-slate-500">{tagline}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">Platform</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li><Link className="text-slate-600 transition-colors hover:text-navy-900" href="/visas">Visa Services</Link></li>
              <li><Link className="text-slate-600 transition-colors hover:text-navy-900" href="/countries">Destinations</Link></li>
              <li><Link className="text-slate-600 transition-colors hover:text-navy-900" href="/b2b">B2B Partnership</Link></li>
              <li><Link className="text-slate-600 transition-colors hover:text-navy-900" href="/login">Agency & Staff Login</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">Company</p>
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
            <span>© {new Date().getFullYear()} {brandName}. All rights reserved.</span>
            <span>Professional B2B visa operations platform.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
