import Link from "next/link";
import type { ReactNode } from "react";
import { logoutAction } from "@/app/actions/auth";
import { initials } from "@/lib/format";
import type { AuthUser } from "@/lib/types";
import BrandMark from "@/components/brand-mark";
import { NavList, type NavSection } from "@/components/nav-list";

export type { NavSection, NavItem } from "@/components/nav-list";

export function AppShell(props: {
  user: AuthUser;
  nav: NavSection[];
  /** Chrome translator (chromeT(locale)); defaults to EN pass-through. */
  t?: (s: string) => string;
  brandSuffix: string;
  agencyLogoUrl?: string | null;
  /** Uploaded platform logo + brand identity (from /admin/settings branding). */
  platformLogoUrl?: string | null;
  brandName?: string;
  /** Extra controls rendered in the top header cluster (e.g. language switcher). */
  headerExtras?: ReactNode;
  children: ReactNode;
}) {
  const { user } = props;
  const t = props.t ?? ((s: string) => s);
  return (
    <div className="flex min-h-screen">
      {/* Sidebar — floating glass panel on porcelain */}
      <aside className="fixed inset-y-0 start-0 z-40 hidden w-64 flex-col border-e border-line/80 bg-white/80 backdrop-blur-xl lg:flex">
        <SidebarBrand suffix={props.brandSuffix} platformLogoUrl={props.platformLogoUrl} brandName={props.brandName} />
        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
          <NavList sections={props.nav} />
        </nav>
        <div className="px-3 pb-4">
          <div className="rounded-2xl border border-line/80 bg-ivory-50/80 p-3">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-iris-400 to-iris-600 text-xs font-bold text-white shadow-[0_6px_14px_-6px_rgb(74_91_208/0.6)]">
                {initials(user.name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-navy-900">{user.name}</p>
                <p className="truncate text-[11px] text-slate-400">{user.email}</p>
              </div>
            </div>
            <form action={logoutAction} className="mt-2.5">
              <button className="w-full rounded-xl border border-ivory-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 transition-colors hover:bg-ivory-100 hover:text-navy-900">
                {t("Sign out")}
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Mobile nav (CSS-only drawer) — .mobnav-panel handles LTR/RTL motion in globals.css */}
      <div className="lg:hidden">
        <input type="checkbox" id="mobnav" className="peer sr-only" />
        <label
          htmlFor="mobnav"
          className="fixed inset-0 z-40 hidden bg-navy-950/30 backdrop-blur-sm peer-checked:block"
          aria-label="Close navigation"
        />
        <div className="mobnav-panel fixed inset-y-0 start-0 z-50 flex w-72 flex-col border-e border-line bg-white transition-transform duration-300 peer-checked:!translate-x-0">
          <SidebarBrand suffix={props.brandSuffix} platformLogoUrl={props.platformLogoUrl} brandName={props.brandName} />
          <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
            <NavList sections={props.nav} />
          </nav>
          <div className="px-3 pb-4">
            <form action={logoutAction}>
              <button className="w-full rounded-xl border border-ivory-200 bg-ivory-50 px-3 py-2 text-xs font-semibold text-slate-500">
                {t("Sign out")} ({user.name})
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col lg:ps-64">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-line/70 bg-white/65 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <label
            htmlFor="mobnav"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-ivory-200 bg-white text-slate-500 transition-colors hover:text-navy-900 lg:hidden"
            aria-label="Open navigation"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </label>
          <div className="hidden items-center gap-2 lg:flex">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              {props.brandSuffix}
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            {props.headerExtras}
            {user.agencyName ? (
              <span className="badge max-w-[220px] truncate bg-ivory-100 text-navy-800">
                {props.agencyLogoUrl ? (
                    <img
                    src={props.agencyLogoUrl}
                    alt=""
                    className="h-6 w-6 shrink-0 rounded-[30%] object-contain"
                  />
                ) : null}
                {user.agencyName}
              </span>
            ) : null}
            <span className="badge bg-gold-100 text-gold-700 hidden sm:inline-flex">
              {user.role.replaceAll("_", " ")}
            </span>
          </div>
        </header>
        <main className="flex-1 px-4 py-8 sm:px-6 lg:px-10">{props.children}</main>
      </div>
    </div>
  );
}

/**
 * Sidebar identity. When a custom platform logo exists it IS the brand (the
 * uploaded artwork already carries the ESSAFARIA identity) → render it
 * prominently, aspect-ratio preserved, with only the portal suffix beside it.
 * Otherwise keep the built-in monogram + wordmark fallback.
 */
function SidebarBrand({
  suffix,
  platformLogoUrl,
  brandName,
}: {
  suffix: string;
  platformLogoUrl?: string | null;
  brandName?: string;
}) {
  if (platformLogoUrl) {
    return (
      <Link href="/" className="flex flex-col gap-1.5 border-b border-line/70 px-5 py-4">
        <img
          src={platformLogoUrl}
          alt={brandName ?? "ESSAFARIA"}
          className="h-12 w-auto max-w-full self-start object-contain"
        />
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gold-600">{suffix}</span>
      </Link>
    );
  }
  return (
    <Link href="/" className="flex items-center gap-3 border-b border-line/70 px-5 py-4">
      <BrandMark className="h-10 w-10" />
      <span className="leading-tight">
        <span className="block text-sm font-bold tracking-[0.06em] text-navy-900">{brandName ?? "ESSAFARIA"}</span>
        <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-gold-600">{suffix}</span>
      </span>
    </Link>
  );
}
