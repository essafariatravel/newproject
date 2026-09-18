import Link from "next/link";
import { pageUser } from "@/lib/page-auth";
import { recentCommunications } from "@/lib/queries";
import { formatDateTime } from "@/lib/format";
import { EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminCommunicationsPage() {
  await pageUser();
  const messages = await recentCommunications(40);

  return (
    <>
      <PageHeader
        title="Communications"
        subtitle="Latest messages across all application threads. Open an application to reply."
      />
      {messages.length === 0 ? (
        <div className="card"><EmptyState title="No messages yet" body="Application communication timelines will appear here." /></div>
      ) : (
        <div className="space-y-3">
          {messages.map(({ message, authorName, applicationReference, applicationId, agencyName }) => (
            <div key={message.id} className="card px-4 py-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs">
                  <Link href={`/admin/applications/${applicationId}?tab=communications`} className="font-semibold text-navy-900 hover:underline">
                    {applicationReference}
                  </Link>
                  <span className="text-slate-400"> · {agencyName}</span>
                </p>
                <div className="flex items-center gap-2">
                  <span className={`badge ${message.visibility === "INTERNAL" ? "bg-slate-200 text-slate-600" : "bg-teal-100 text-teal-700"}`}>
                    {message.visibility === "INTERNAL" ? "Internal note" : "Agency-visible"}
                  </span>
                  <span className="text-[11px] text-slate-400">{formatDateTime(message.createdAt)}</span>
                </div>
              </div>
              <p className="mt-1.5 line-clamp-2 text-sm text-slate-700">{message.body}</p>
              <p className="mt-1 text-[11px] text-slate-400">— {authorName}</p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
