import "./agency-v2.css";
import { AgencyCommand } from "./applications/agency-command";
import { hasPermission } from "@/lib/rbac";
import { AgencyPopoverController } from "@/components/agency-popover-controller";
import { LiveNotifications } from "@/components/live-notifications";
import { contentT } from "@/lib/i18n-content";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getSessionUser } from "@/lib/auth";
import { isAgencyRole } from "@/lib/types";
import { businessLabel } from "@/lib/business-labels";
import { countryName } from "@/lib/country-names";
import { unreadNotificationCount, notificationBellEventsForUser } from "@/lib/queries";
import { AppShell, type NavSection } from "@/components/app-shell";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { agencies } from "@/db/schema";
import { agencyLogoUrl, brandLogoUrl, readBranding } from "@/lib/branding";
import { chromeT, getUiLocale } from "@/lib/ui-i18n";
import { UiLanguageSwitcher } from "@/components/ui-language-switcher";
import type { Metadata } from "next";
import { buildNoIndexMetadata } from "@/lib/seo";

export const metadata: Metadata = buildNoIndexMetadata("Agency workspace");
export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!isAgencyRole(user.role)) redirect("/admin"); // staff belong in the Back Office
  if (!user.agencyId) redirect("/login");

  const [unread,bellRows] = await Promise.all([unreadNotificationCount(user.id),notificationBellEventsForUser(user.id,user.agencyId)]);
  const locale = await getUiLocale();
  const tr = chromeT(locale);
  const initialEvents=bellRows.map(n=>({id:n.id,title:businessLabel(n.type,locale),link:(n.type.includes("WALLET")||n.type==="TOPUP_REQUESTED")&&!hasPermission(user,"wallet.view.own")?null:n.link,createdAt:n.createdAt.toISOString(),readAt:n.readAt?.toISOString()??null,type:n.type,applicationId:n.applicationId,context:[n.destination?countryName({name:n.destination,iso2:n.countryIso2},locale):null,n.reference].filter(Boolean).join(" · ")}));
  const agencyRows = await db
    .select({ logoKey: agencies.logoKey, logoUploadedAt: agencies.logoUploadedAt })
    .from(agencies)
    .where(eq(agencies.id, user.agencyId))
    .limit(1);
  const agencyLogo = agencyRows[0]
    ? agencyLogoUrl({ id: user.agencyId, logoKey: agencyRows[0].logoKey, logoUploadedAt: agencyRows[0].logoUploadedAt })
    : null;

  const nav: NavSection[] = [
    {
      title: tr("Your agency"),
      items: [
        { href: "/portal", label: tr("Dashboard")},
        { href: "/portal/applications", label: tr("Applications")},
        { href: "/portal/applications/new", label: tr("New Application")},
      ],
    },
    {
      title: tr("Finance"),
      items: [{ href: "/portal/wallet", label: tr("Wallet & Transactions")}],
    },
    {
      title: tr("Workspace"),
      items: [
        { href: "/portal/notifications", label: tr("Notifications"), badge: unread },
        { href: "/portal/communications", label: tr("Communications")},
        { href: "/portal/profile", label: tr("Profile")},
      ],
    },
  ];

  const platformBranding = await readBranding().catch(() => null);

  return (
    <AppShell
      surface="agency"
      t={tr}
      user={user}
      locale={locale}
      nav={nav}
      brandSuffix={tr("Agency Portal")}
      agencyLogoUrl={agencyLogo}
      platformLogoUrl={platformBranding ? brandLogoUrl(platformBranding) : null}
      brandName={platformBranding?.name}
      headerExtras={<><AgencyCommand locale={locale} canCreate={hasPermission(user,"applications.create")} canUpload={hasPermission(user,"documents.upload.own")} canWallet={hasPermission(user,"wallet.view.own")} /><LiveNotifications initialEvents={initialEvents} agencyLocale={locale} refreshFirstEvent initialCount={unread} href="/portal/notifications" label={tr("Notifications")} soundLabel={contentT(locale)("Notification sounds")} closeLabel={contentT(locale)("Close")} /><UiLanguageSwitcher locale={locale} compact /></>}
    >
      <AgencyPopoverController />
      {children}
    </AppShell>
  );
}
