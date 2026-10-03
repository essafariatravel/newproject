import Link from "next/link";
import { MobileNavigation } from "@/components/mobile-navigation";
import { WorkspaceNavigation } from "@/components/workspace-navigation";
import { LivePresence } from "@/components/live-presence";
import { contentT } from "@/lib/i18n-content";
import { businessLabel } from "@/lib/business-labels";
import type { UiLocale } from "@/lib/ui-i18n";
import type { ReactNode } from "react";
import { logoutAction } from "@/app/actions/auth";
import { initials } from "@/lib/format";
import type { AuthUser } from "@/lib/types";
import { NavList, type NavSection } from "@/components/nav-list";
import { AgencyBottomNavigation } from "@/components/agency-bottom-navigation";
import { presenceWritesSuppressed } from "@/lib/presence-preview-policy";
import { AccountMenu } from "@/components/account-menu";
import { SessionActivity } from "@/components/session-activity";

export type { NavSection, NavItem } from "@/components/nav-list";

export function AppShell(props: {
  user: AuthUser;
  locale?: UiLocale;
  nav: NavSection[];
  /** Chrome translator (chromeT(locale)); defaults to EN pass-through. */
  t?: (s: string) => string;
  brandSuffix: string;
  agencyLogoUrl?: string | null;
  /** Uploaded platform logo + brand identity (from /admin/settings branding). */
  platformLogoUrl?: string | null;
  brandName?: string;
  surface?: "agency" | "staff";
  /** Extra controls rendered in the top header cluster (e.g. language switcher). */
  headerExtras?: ReactNode;
  children: ReactNode;
}) {
  const { user } = props;
  const t = props.t ?? ((s: string) => s);
  return (
    <div className={`workspace-${props.surface ?? "agency"} flex min-h-screen`}>
      <WorkspaceNavigation />
      <SessionActivity />
      <a className="workspace-skip" href="#workspace-main">{t("Skip to content")}</a>
      <aside className="fixed inset-y-0 start-0 z-40 hidden w-64 flex-col border-e border-white/10 bg-navy-950 text-white lg:flex workspace-sidebar">
        <SidebarBrand suffix={props.brandSuffix} platformLogoUrl={props.platformLogoUrl} brandName={props.brandName} />
        <nav className="flex-1 space-y-6 overflow-y-auto px-4 py-4">
          <NavList sections={props.nav} />
        </nav>
        <div className="px-4 pb-4">
          <div className="border-t border-white/10 pt-4">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold-500 text-xs font-semibold text-navy-950">
                {initials(user.name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold text-white">{user.name}</p>
                <p className="truncate text-xs text-white/55">{user.email}</p>
              </div>
            </div>
            <form action={logoutAction} className="mt-2">
              <button className="min-h-11 w-full rounded-lg border border-white/20 bg-transparent px-4 text-base font-semibold text-white/75 transition-colors hover:bg-white/10 hover:text-white">
                {t("Sign out")}
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col lg:ps-64">
        <header className="workspace-topbar sticky top-0 z-30 flex h-16 items-center justify-between gap-2 border-b border-line bg-white px-4 sm:px-6 lg:px-8">
          {props.surface !== "staff" ? <Link href="/portal" className="agency-header-brand" aria-label={props.brandName ?? "ESSAFARIA"}><img src={props.platformLogoUrl ?? "/images/essafaria-logo.png"} alt="" width="64" height="46" /><span>{props.brandName ?? "ESSAFARIA"}<small>{props.brandSuffix}</small></span></Link> : null}
          <MobileNavigation openLabel={t("Menu")} closeLabel={t("Close menu")}>
            <SidebarBrand suffix={props.brandSuffix} platformLogoUrl={props.platformLogoUrl} brandName={props.brandName} />
            <nav className="flex-1 space-y-6 overflow-y-auto px-4 py-4"><NavList sections={props.nav} /></nav>
            <form action={logoutAction} className="p-4"><button className="min-h-11 w-full rounded-lg border border-white/20 px-4 text-base text-white">{t("Sign out")}</button></form>
          </MobileNavigation>
          <div className="workspace-header-suffix hidden items-center gap-2 lg:flex">
            <span className="text-xs font-semibold tracking-[0.04em] text-slate-500">
              {props.brandSuffix}
            </span>
          </div>
          <div className="flex min-w-0 items-center gap-2 sm:gap-2">
            {!presenceWritesSuppressed() ? <LivePresence staff={props.surface === "staff"} label={contentT(props.locale ?? "en")("Online now")} /> : null}
            {props.headerExtras}
            {user.agencyName ? (
              <span className="workspace-header-context hidden max-w-[180px] items-center gap-2 truncate text-xs font-semibold text-navy-700 sm:inline-flex">
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
            <span className="hidden text-xs text-slate-500 sm:inline">
              {businessLabel(user.role, props.locale ?? "en")}
            </span>
            <AccountMenu user={user} locale={props.locale ?? "en"} />
          </div>
        </header>
        {props.surface !== "staff" ? <nav className="agency-desktop-navigation" aria-label={props.brandSuffix}><NavList sections={props.nav} /></nav> : null}
        <main id="workspace-main" className="min-w-0 flex-1 px-4 py-8 sm:px-6 lg:px-8"><div className="workspace-page">{props.children}</div></main>
      </div>
      {props.surface !== "staff" ? <AgencyBottomNavigation sections={props.nav} label={props.brandSuffix} locale={props.locale ?? "en"} /> : null}
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
      <Link href="/" className="flex flex-col gap-2 border-b border-white/10 px-4 py-4">
        <img
          src={platformLogoUrl}
          alt={brandName ?? "ESSAFARIA"}
          className="h-12 w-auto max-w-full self-start object-contain"
        />
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-gold-600">{suffix}</span>
      </Link>
    );
  }
  return (
    <Link href="/" className="flex items-center gap-4 border-b border-white/10 px-4 py-4">
      <img src="/images/essafaria-logo.png" alt="" width="64" height="46" className="h-12 w-16 shrink-0 rounded bg-white p-1 object-contain" />
      <span className="leading-tight">
        <span className="block text-base font-serif font-semibold tracking-[0.08em] text-white">{brandName ?? "ESSAFARIA"}</span>
        <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-gold-600">{suffix}</span>
      </span>
    </Link>
  );
}
