import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getSessionUser } from "@/lib/auth";
import { isAgencyRole } from "@/lib/types";
import { unreadNotificationCount } from "@/lib/queries";
import { AppShell, type NavSection } from "@/components/app-shell";

export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!isAgencyRole(user.role)) redirect("/admin"); // staff belong in the Back Office
  if (!user.agencyId) redirect("/login");

  const unread = await unreadNotificationCount(user.id);

  const nav: NavSection[] = [
    {
      title: "Your agency",
      items: [
        { href: "/portal", label: "Dashboard" },
        { href: "/portal/applications", label: "Applications" },
        { href: "/portal/applications/new", label: "New Application" },
        { href: "/portal/applicants", label: "Applicants" },
        { href: "/portal/documents", label: "Documents" },
      ],
    },
    {
      title: "Finance",
      items: [{ href: "/portal/wallet", label: "Wallet & Transactions" }],
    },
    {
      title: "Workspace",
      items: [
        { href: "/portal/notifications", label: "Notifications", badge: unread },
        { href: "/portal/communications", label: "Communications" },
        { href: "/portal/profile", label: "Profile" },
      ],
    },
  ];

  return (
    <AppShell user={user} nav={nav} brandSuffix="Agency Portal">
      {children}
    </AppShell>
  );
}
