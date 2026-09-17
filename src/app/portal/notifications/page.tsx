import { portalPageUser } from "@/lib/page-auth";
import { NotificationsPage } from "@/components/notifications-page";

export const dynamic = "force-dynamic";

export default async function PortalNotificationsPage() {
  const user = await portalPageUser();
  return <NotificationsPage user={user} basePath="/portal/notifications" />;
}
