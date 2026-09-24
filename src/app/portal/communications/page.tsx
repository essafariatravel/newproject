import Link from "next/link";
import { recentCommunications } from "@/lib/queries";
import { formatDateTime } from "@/lib/format";
import { EmptyState, PageHeader } from "@/components/ui";
import { getUiLocale } from "@/lib/ui-i18n";
import { contentT } from "@/lib/i18n-content";
import { portalPageUser } from "@/lib/page-auth";

export const dynamic = "force-dynamic";

export default async function PortalCommunicationsPage() {
  const user = await portalPageUser();
  const uiLocale = await getUiLocale();
  const ct = contentT(uiLocale);
  // Tenant scope comes from the SESSION. The query is scoped by dossier owner and
  // by audience, so this inbox can never list another agency's conversation.
  const messages = await recentCommunications(100, {
    agencyId: user.agencyId,
    agencyVisibleOnly: true,
  });

  return (
    <>
      <PageHeader title={ct("Communications")} subtitle={ct("Latest agency-visible messages on your applications.")} />
      {messages.length === 0 ? (
        <div className="card"><EmptyState title={ct("No messages yet")} body={ct("Open an application and post a message — ESSAFARIA case officers will reply in the same thread.")} /></div>
      ) : (
        <div className="space-y-3">
          {messages.map(({ message, authorName, applicationReference, applicationId }) => (
            <div key={message.id} className="card px-4 py-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`/portal/applications/${applicationId}?tab=communications`} className="text-xs font-semibold text-navy-900 hover:underline">
                  {applicationReference}
                </Link>
                <span className="text-[11px] text-slate-400">{formatDateTime(message.createdAt, uiLocale)}</span>
              </div>
              <p className="mt-1.5 text-sm text-slate-700">{message.body}</p>
              <p className="mt-1 text-[11px] text-slate-400">— {authorName}</p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
