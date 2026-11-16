import { portalPageUser } from "@/lib/page-auth";
import { NotificationsPage } from "@/components/notifications-page";

export const dynamic = "force-dynamic";

export default async function PortalNotificationsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await portalPageUser();
  const sp = await (searchParams ?? Promise.resolve({})); // query-lang pass-through
  return <NotificationsPage user={user} sp={sp} basePath="/portal/notifications" />;
}
