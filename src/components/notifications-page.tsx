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
    <div className="travel-notifications travel-workspace">
      <PageHeader
        title={ct("Notifications")}
        subtitle={unread > 0 ? `${unread} ${ct("unread notifications")}` : ct("You're up to date")}
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
        {[["all", "All"], ["action", "Action required"], ["applications", "Applications"], ["messages", "Messages"], ["wallet", "Wallet"]].map(([id, label]) => (
          <Link
            key={id}
            href={`${basePath}?filter=${id}`}
            aria-current={filter === id ? "page" : undefined}
            className="notification-filter"
          >
            {ct(label!)}
          </Link>
        ))}
      </nav>

      {visible.length === 0 ? (
        <EmptyState title={ct("No notifications")} body={ct("Events on your applications will appear here.")} />
      ) : (
        <div className="notification-feed">
          {visible.map((n) => (
            <article key={n.id} className="notification-item" data-unread={!n.readAt}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <h2 className="text-sm font-semibold text-navy-900">
                    {n.link ? <Link href={n.link} className="hover:underline">{businessLabel(n.type, locale)}</Link> : businessLabel(n.type, locale)}
                  </h2>
                  <time className="text-[11px] text-slate-400">{formatDateTime(n.createdAt, locale)}</time>
                </div>
                {["MESSAGE_POSTED", "DOCUMENT_REQUESTED"].includes(n.type) && n.body ? (
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">{n.body}</p>
                ) : null}
              </div>
              <div className="notification-item-actions flex items-center gap-3 text-xs">
                {n.link ? <Link href={n.link} className="travel-inline-link">{ct("Open")} →</Link> : null}
                {!n.readAt ? (
                  <form action={markNotificationsReadAction}>
                    <input type="hidden" name="id" value={n.id} />
                    <input type="hidden" name="back" value={basePath} />
                    <SubmitButton className="px-0 py-1 text-xs font-medium text-slate-500 hover:text-navy-900" pendingLabel="…">{ct("Mark read")}</SubmitButton>
                  </form>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
