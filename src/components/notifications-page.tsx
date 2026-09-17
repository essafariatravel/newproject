import Link from "next/link";
import { listNotificationsForUser } from "@/lib/queries";
import { markNotificationsReadAction } from "@/app/actions/communications";
import { SubmitButton } from "@/components/forms";
import { EmptyState, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import type { AuthUser } from "@/lib/types";

export async function NotificationsPage({ user, basePath }: { user: AuthUser; basePath: string }) {
  const notifications = await listNotificationsForUser(user.id);
  const unread = notifications.filter((n) => !n.readAt).length;

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle={`${unread} unread · ${notifications.length} total`}
        actions={
          unread > 0 ? (
            <form action={markNotificationsReadAction}>
              <input type="hidden" name="back" value={basePath} />
              <SubmitButton className="btn-secondary btn-sm" pendingLabel="…">Mark all as read</SubmitButton>
            </form>
          ) : undefined
        }
      />
      {notifications.length === 0 ? (
        <div className="card"><EmptyState title="No notifications" body="Events on your applications will appear here." /></div>
      ) : (
        <div className="space-y-2.5">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`card flex items-start justify-between gap-3 px-4 py-3.5 ${n.readAt ? "opacity-70" : "border-l-2 border-l-gold-500"}`}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-navy-900">
                  {n.title}
                  {!n.readAt ? <span className="badge ml-2 bg-gold-100 text-gold-600">New</span> : null}
                </p>
                <p className="mt-0.5 text-sm text-slate-600">{n.body}</p>
                <p className="mt-1 text-[11px] text-slate-400">{formatDateTime(n.createdAt)}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                {n.link ? (
                  <Link href={n.link} className="btn-secondary btn-sm">
                    Open →
                  </Link>
                ) : null}
                {!n.readAt ? (
                  <form action={markNotificationsReadAction}>
                    <input type="hidden" name="id" value={n.id} />
                    <input type="hidden" name="back" value={basePath} />
                    <SubmitButton className="btn-secondary btn-sm" pendingLabel="…">Mark read</SubmitButton>
                  </form>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
