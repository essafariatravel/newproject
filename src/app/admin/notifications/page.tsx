import { pageUser } from "@/lib/page-auth";
import { NotificationsPage } from "@/components/notifications-page";
import { PushSettings } from "@/components/push-settings";
import { getUiLocale } from "@/lib/ui-i18n";

export const dynamic = "force-dynamic";

export default async function AdminNotificationsPage({ searchParams }: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await pageUser();
  const sp = await (searchParams ?? Promise.resolve({}));
  const locale = await getUiLocale(sp);
  return <>
    <PushSettings locale={locale} />
    <NotificationsPage user={user} sp={sp} basePath="/admin/notifications" />
  </>;
}
