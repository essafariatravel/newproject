import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { unreadNotificationCount } from "@/lib/queries";
import { pendingRegistrationCount } from "@/lib/registrations";
import { AppShell, type NavSection } from "@/components/app-shell";
import { readBranding, brandLogoUrl } from "@/lib/branding";
import { chromeT, getUiLocale } from "@/lib/ui-i18n";
import { UiLanguageSwitcher } from "@/components/ui-language-switcher";
import { StaffSearch } from "@/components/staff-search";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasPermission(user, "admin.access")) {
    redirect("/portal"); // agency users go to their portal instead
  }
  const unread = await unreadNotificationCount(user.id);
  const pendingRegistrations = hasPermission(user, "registrations.view")
    ? await pendingRegistrationCount().catch(() => 0)
    : 0;
  const locale = await getUiLocale();
  const tr = chromeT(locale);

  const nav: NavSection[] = [
    {
      title: tr("Overview"),
      items: [
        { href: "/admin", label: tr("Dashboard")},
        { href: "/admin/notifications", label: tr("Notifications"), badge: unread },
      ],
    },
    {
      title: tr("Operations"),
      items: [
        { href: "/admin/applications", label: tr("Applications")},
        { href: "/admin/communications", label: tr("Communications")},
      ],
    },
    {
      title: tr("Partners"),
      items: [
        { href: "/admin/registrations", label: tr("Agency Registrations"), badge: pendingRegistrations },
        { href: "/admin/agencies", label: tr("Agencies")},
        { href: "/admin/users", label: tr("Users")},
      ],
    },
    {
      title: tr("Finance"),
      items: [{ href: "/admin/billing", label: tr("Wallets & Billing")}],
    },
    {
      title: tr("Configuration"),
      items: [
        { href: "/admin/config/countries", label: tr("Countries")},
        { href: "/admin/config/visa-categories", label: tr("Visa Categories")},
        { href: "/admin/config/visa-types", label: tr("Visa Types")},
        { href: "/admin/config/document-types", label: tr("Document Types")},
        { href: "/admin/config/statuses", label: tr("Statuses & Transitions")},
        { href: "/admin/config/priorities", label: tr("Priorities")},
      ],
    },
    {
      title: tr("Insights"),
      items: [
        { href: "/admin/reports", label: tr("Reports")},
        { href: "/admin/audit", label: tr("Audit Logs")},
        { href: "/admin/settings", label: tr("Settings")},
      ],
    },
  ];

  const platformBranding = await readBranding().catch(() => null);

  return (
    <AppShell
      surface="staff"
      t={tr}
      user={user}
      nav={nav}
      brandSuffix="Back Office"
      platformLogoUrl={platformBranding ? brandLogoUrl(platformBranding) : null}
      brandName={platformBranding?.name}
      headerExtras={
        <>
          <StaffSearch label={tr("Search")} placeholder={tr("Search…")} />
          <UiLanguageSwitcher locale={locale} compact />
        </>
      }
    >
      {children}
    </AppShell>
  );
}
