import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getSessionUser } from "@/lib/auth";
import { isAgencyRole } from "@/lib/types";
import { unreadNotificationCount } from "@/lib/queries";
import { AppShell, type NavSection } from "@/components/app-shell";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { agencies } from "@/db/schema";
import { agencyLogoUrl, brandLogoUrl, readBranding } from "@/lib/branding";
import { chromeT, getUiLocale } from "@/lib/ui-i18n";
import { UiLanguageSwitcher } from "@/components/ui-language-switcher";

export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!isAgencyRole(user.role)) redirect("/admin"); // staff belong in the Back Office
  if (!user.agencyId) redirect("/login");

  const unread = await unreadNotificationCount(user.id);
  const locale = await getUiLocale();
  const tr = chromeT(locale);
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
      nav={nav}
      brandSuffix={tr("Agency Portal")}
      agencyLogoUrl={agencyLogo}
      platformLogoUrl={platformBranding ? brandLogoUrl(platformBranding) : null}
      brandName={platformBranding?.name}
      headerExtras={<UiLanguageSwitcher locale={locale} compact />}
    >
      {children}
    </AppShell>
  );
}
