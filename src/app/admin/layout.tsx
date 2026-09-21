import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { unreadNotificationCount } from "@/lib/queries";
import { pendingRegistrationCount } from "@/lib/registrations";
import { AppShell, type NavSection } from "@/components/app-shell";

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

  const nav: NavSection[] = [
    {
      title: "Overview",
      items: [
        { href: "/admin", label: "Dashboard" },
        { href: "/admin/notifications", label: "Notifications", badge: unread },
      ],
    },
    {
      title: "Operations",
      items: [
        { href: "/admin/applications", label: "Applications" },
        { href: "/admin/applicants", label: "Applicants" },
        { href: "/admin/documents", label: "Documents" },
        { href: "/admin/communications", label: "Communications" },
      ],
    },
    {
      title: "Partners",
      items: [
        { href: "/admin/registrations", label: "Agency Registrations", badge: pendingRegistrations },
        { href: "/admin/agencies", label: "Agencies" },
        { href: "/admin/users", label: "Users" },
      ],
    },
    {
      title: "Finance",
      items: [{ href: "/admin/billing", label: "Wallets & Billing" }],
    },
    {
      title: "Configuration",
      items: [
        { href: "/admin/config/countries", label: "Countries" },
        { href: "/admin/config/visa-categories", label: "Visa Categories" },
        { href: "/admin/config/visa-types", label: "Visa Types" },
        { href: "/admin/config/document-types", label: "Document Types" },
        { href: "/admin/config/currencies", label: "Currencies" },
        { href: "/admin/config/statuses", label: "Statuses & Transitions" },
        { href: "/admin/config/priorities", label: "Priorities" },
      ],
    },
    {
      title: "Insights",
      items: [
        { href: "/admin/reports", label: "Reports" },
        { href: "/admin/audit", label: "Audit Logs" },
        { href: "/admin/settings", label: "Settings" },
      ],
    },
  ];

  return (
    <AppShell user={user} nav={nav} brandSuffix="Back Office">
      {children}
    </AppShell>
  );
}
