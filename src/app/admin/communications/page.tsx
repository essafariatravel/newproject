import { pageUser } from "@/lib/page-auth";
import { getUiLocale } from "@/lib/ui-i18n";
import { ConversationInbox } from "@/components/conversation-inbox";
export const dynamic = "force-dynamic";
export default async function AdminCommunicationsPage({ searchParams }: { searchParams: Promise<Record<string,string|undefined>> }) {
  const [user,locale,sp] = await Promise.all([pageUser(),getUiLocale(),searchParams]);
  return <ConversationInbox user={user} locale={locale} sp={sp}/>;
}