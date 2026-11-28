import {hubEnabled} from "@/lib/traveller-hub-policy";
import "./agency-v2.css";
import { AgencyCommand } from "./applications/agency-command";
import { hasPermission } from "@/lib/rbac";
import { AgencyPopoverController } from "@/components/agency-popover-controller";
import { LiveNotifications } from "@/components/live-notifications";
import { contentT } from "@/lib/i18n-content";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getPageSessionUser } from "@/lib/page-auth";
import { coreTimed } from "@/lib/core-timing";
import { agencyNotificationScope } from "@/lib/notification-scope";
import { isAgencyRole } from "@/lib/types";
import { agencyBellEvents } from "@/lib/agency-notification-bell";
import { unreadNotificationCount } from "@/lib/queries";
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
  const user = await getPageSessionUser();
  if (!user) redirect("/login");
  if (!isAgencyRole(user.role)) redirect("/admin"); // staff belong in the Back Office
  if (!user.agencyId) redirect("/login");

  const agencyId=user.agencyId;
  const locale=await getUiLocale();
  const financial=hasPermission(user,"wallet.view.own")&&hasPermission(user,"transactions.view.own");
  const scope=process.env.VERCEL_ENV==="preview"&&process.env.ESSAFARIA_NOTIFICATION_SHARING!=="false"?agencyNotificationScope(user,locale,financial):null;
  const tr=chromeT(locale);
  const [unread,initialEvents,agencyRows,platformBranding]=await coreTimed("agency.shell.read",()=>Promise.all([
    unreadNotificationCount(user.id),
    agencyBellEvents(user.id,agencyId,locale,financial),
    db.select({logoKey:agencies.logoKey,logoUploadedAt:agencies.logoUploadedAt}).from(agencies).where(eq(agencies.id,agencyId)).limit(1),
    readBranding().catch(()=>null),
  ]));
  const agencyLogo = agencyRows[0]
    ? agencyLogoUrl({ id: user.agencyId, logoKey: agencyRows[0].logoKey, logoUploadedAt: agencyRows[0].logoUploadedAt })
    : null;

  const nav: NavSection[] = [
    {
      title: tr("Your agency"),
      items: [
        { href: "/portal", label: tr("Dashboard")},
        { href: "/portal/applications", label: tr("Applications")},
        ...(hubEnabled()&&hasPermission(user,"applicants.view.all")?[{href:"/portal/applicants",label:tr("Applicants")}]:[]),
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
      headerExtras={<><AgencyCommand locale={locale} canCreate={hasPermission(user,"applications.create")} canUpload={hasPermission(user,"documents.upload.own")} canWallet={hasPermission(user,"wallet.view.own")} /><LiveNotifications key={scope??user.id} notificationScope={scope} initialEvents={initialEvents} agencyLocale={locale} refreshFirstEvent initialCount={unread} href="/portal/notifications" label={tr("Notifications")} soundLabel={contentT(locale)("Notification sounds")} closeLabel={contentT(locale)("Close")} /><UiLanguageSwitcher locale={locale} compact /></>}
    >
      <AgencyPopoverController />
      {children}
    </AppShell>
  );
}
