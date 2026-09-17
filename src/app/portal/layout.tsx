import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getSessionUser } from "@/lib/auth";
import { isAgencyRole } from "@/lib/types";
import { unreadNotificationCount } from "@/lib/queries";
import { AppShell, type NavSection } from "@/components/app-shell";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { agencies } from "@/db/schema";
import { agencyLogoUrl } from "@/lib/branding";

export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!isAgencyRole(user.role)) redirect("/admin"); // staff belong in the Back Office
  if (!user.agencyId) redirect("/login");

  const unread = await unreadNotificationCount(user.id);
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
    <AppShell user={user} nav={nav} brandSuffix="Agency Portal" agencyLogoUrl={agencyLogo}>
      {children}
    </AppShell>
  );
}
