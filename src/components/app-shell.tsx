import Link from "next/link";
import type { ReactNode } from "react";
import { logoutAction } from "@/app/actions/auth";
import { initials } from "@/lib/format";
import type { AuthUser } from "@/lib/types";
import { NavList, type NavSection } from "@/components/nav-list";

export type { NavSection, NavItem } from "@/components/nav-list";

export function AppShell(props: {
  user: AuthUser;
  nav: NavSection[];
  brandSuffix: string;
  children: ReactNode;
}) {
  const { user } = props;
  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col bg-navy-950 lg:flex">
        <SidebarBrand suffix={props.brandSuffix} />
        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
          <NavList sections={props.nav} />
        </nav>
        <div className="border-t border-white/10 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-700 text-xs font-semibold text-white">
              {initials(user.name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{user.name}</p>
              <p className="truncate text-[11px] text-slate-500">{user.email}</p>
            </div>
          </div>
          <form action={logoutAction} className="mt-2.5">
            <button className="w-full rounded-md border border-white/15 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:bg-white/10 hover:text-white">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* Mobile nav (CSS-only drawer) */}
      <div className="lg:hidden">
        <input type="checkbox" id="mobnav" className="peer sr-only" />
        <label
          htmlFor="mobnav"
          className="fixed inset-0 z-40 hidden bg-navy-950/60 peer-checked:block"
          aria-label="Close navigation"
        />
        <div className="fixed inset-y-0 left-0 z-50 w-72 -translate-x-full flex-col bg-navy-950 transition-transform peer-checked:translate-x-0">
          <SidebarBrand suffix={props.brandSuffix} />
          <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
            <NavList sections={props.nav} />
          </nav>
          <div className="border-t border-white/10 px-4 py-3">
            <form action={logoutAction}>
              <button className="w-full rounded-md border border-white/15 px-3 py-1.5 text-xs text-slate-300">
                Sign out ({user.name})
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-slate-200 bg-ivory-50/90 px-4 backdrop-blur sm:px-6">
          <label
            htmlFor="mobnav"
            className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 text-slate-600 lg:hidden"
            aria-label="Open navigation"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </label>
          <div className="hidden items-center gap-2 lg:flex">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
              {props.brandSuffix}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {user.agencyName ? (
              <span className="badge bg-navy-900/5 text-navy-800 max-w-[180px] truncate">{user.agencyName}</span>
            ) : null}
            <span className="badge bg-gold-100 text-gold-600 hidden sm:inline-flex">{user.role.replaceAll("_", " ")}</span>
          </div>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{props.children}</main>
      </div>
    </div>
  );
}

function SidebarBrand({ suffix }: { suffix: string }) {
  return (
    <Link href="/" className="flex items-center gap-2.5 border-b border-white/10 px-5 py-4">
      <svg viewBox="0 0 40 40" className="h-8 w-8" aria-hidden>
        <circle cx="20" cy="20" r="19" className="fill-navy-800" />
        <path d="M12 12h16v4.2H17v3.4h9.6v4H17v3.4h11V31H12z" className="fill-gold-400" />
      </svg>
      <span className="leading-tight">
        <span className="block font-serif text-sm font-semibold tracking-wide text-white">ESSAFARIA</span>
        <span className="block text-[10px] uppercase tracking-[0.18em] text-gold-400">{suffix}</span>
      </span>
    </Link>
  );
}

