import { businessLabel, notificationCategory } from "@/lib/business-labels";
import Link from "next/link";
import { listNotificationsForUser } from "@/lib/queries";
import { markNotificationsReadAction } from "@/app/actions/communications";
import { SubmitButton } from "@/components/forms";
import { EmptyState, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import type { AuthUser } from "@/lib/types";
import { getUiLocale } from "@/lib/ui-i18n";
import { contentT } from "@/lib/i18n-content";

export async function NotificationsPage({
  user,
  basePath,
  sp,
}: {
  user: AuthUser;
  basePath: string;
  sp?: Record<string, unknown>;
}) {
  const locale = await getUiLocale(sp);
  const ct = contentT(locale);
  const notifications = await listNotificationsForUser(user.id);
  const filter = typeof sp?.filter === "string" ? sp.filter : "all";
  const visible = notifications.filter((n) => filter === "all" || notificationCategory(n.type) === filter);
  const unread = notifications.filter((n) => !n.readAt).length;

  return (
    <>
      <PageHeader
        title={ct("Notifications")}
        subtitle={`${unread} ${ct("unread notifications")} · ${notifications.length} ${ct("total")}`}
        actions={
          unread > 0 ? (
            <form action={markNotificationsReadAction}>
              <input type="hidden" name="back" value={basePath} />
              <SubmitButton className="btn-secondary btn-sm" pendingLabel="…">{ct("Mark all as read")}</SubmitButton>
            </form>
          ) : undefined
        }
      />
      <nav className="notification-filters" aria-label={ct("Notifications")}>
        {[["all", "All"], ["action", "Action required"], ["applications", "Applications"], ["messages", "Messages"], ["wallet", "Wallet"]].map(([id, label]) => <Link key={id} href={`${basePath}?filter=${id}`} aria-current={filter === id ? "page" : undefined}>{ct(label!)}</Link>)}
      </nav>
      {visible.length === 0 ? (
        <div className="card"><EmptyState title={ct("No notifications")} body={ct("Events on your applications will appear here.")} /></div>
      ) : (
        <ol className="notification-feed">
          {visible.map((n) => (
            <li
              key={n.id}
              className={`notification-event flex items-start justify-between gap-3 px-4 py-3.5 ${n.readAt ? "notification-event-read" : "border-s-2 border-s-gold-500"}`}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-navy-900">
                  {n.link ? <Link href={n.link} className="hover:underline">{businessLabel(n.type, locale)}</Link> : businessLabel(n.type, locale)}
                  {!n.readAt ? <span className="badge ms-2 bg-gold-100 text-gold-600">{ct("New")}</span> : null}
                </p>
                <p className="mt-0.5 text-sm text-slate-600">{["MESSAGE_POSTED", "DOCUMENT_REQUESTED"].includes(n.type) ? n.body : null}</p>
                <p className="mt-1 text-[11px] text-slate-400">{formatDateTime(n.createdAt, locale)}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                {n.link ? (
                  <Link href={n.link} className="btn-secondary btn-sm">
                    {ct("Open")} →
                  </Link>
                ) : null}
                {!n.readAt ? (
                  <form action={markNotificationsReadAction}>
                    <input type="hidden" name="id" value={n.id} />
                    <input type="hidden" name="back" value={basePath} />
                    <SubmitButton className="btn-secondary btn-sm" pendingLabel="…">{ct("Mark read")}</SubmitButton>
                  </form>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
