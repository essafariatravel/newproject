import Link from "next/link";
import { recentCommunications } from "@/lib/queries";
import { formatDateTime } from "@/lib/format";
import { EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function PortalCommunicationsPage() {
  const messages = (await recentCommunications(100)).filter((m) => m.message.visibility === "AGENCY");

  return (
    <>
      <PageHeader title="Communications" subtitle="Latest agency-visible messages on your applications." />
      {messages.length === 0 ? (
        <div className="card"><EmptyState title="No messages yet" body="Open an application and post a message — ESSAFARIA case officers will reply in the same thread." /></div>
      ) : (
        <div className="space-y-3">
          {messages.map(({ message, authorName, applicationReference, applicationId }) => (
            <div key={message.id} className="card px-4 py-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`/portal/applications/${applicationId}?tab=communications`} className="text-xs font-semibold text-navy-900 hover:underline">
                  {applicationReference}
                </Link>
                <span className="text-[11px] text-slate-400">{formatDateTime(message.createdAt)}</span>
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
