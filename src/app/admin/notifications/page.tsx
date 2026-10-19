import { pageUser } from "@/lib/page-auth";
import { NotificationsPage } from "@/components/notifications-page";

export const dynamic = "force-dynamic";

export default async function AdminNotificationsPage({ searchParams }: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await pageUser();
  const sp = await (searchParams ?? Promise.resolve({}));
  return <NotificationsPage user={user} sp={sp} basePath="/admin/notifications" />;
}
