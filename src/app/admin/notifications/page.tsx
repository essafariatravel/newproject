import { pageUser } from "@/lib/page-auth";
import { NotificationsPage } from "@/components/notifications-page";

export const dynamic = "force-dynamic";

export default async function AdminNotificationsPage() {
  const user = await pageUser();
  return <NotificationsPage user={user} basePath="/admin/notifications" />;
}
