import { businessLabel } from "@/lib/business-labels";
import Link from "next/link";
import { listNotificationsForUser, unreadNotificationCount } from "@/lib/queries";
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
  const filter = typeof sp?.filter === "string" && ["all", "action", "applications", "messages", "wallet"].includes(sp.filter) ? sp.filter as "all" | "action" | "applications" | "messages" | "wallet" : "all";
  const [unread, visible] = await Promise.all([unreadNotificationCount(user.id), listNotificationsForUser(user.id, 100, filter)]);

  return (
    <>
      <PageHeader
        title={ct("Notifications")}
        subtitle={`${unread} ${ct("unread notifications")}`}
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
              className={`notification-event flex items-start justify-between gap-4 px-4 py-4 ${n.readAt ? "notification-event-read" : "border-s-2 border-s-gold-500"}`}
            >
              <div className="min-w-0">
                <p className="text-base font-semibold text-navy-900">
                  {n.link ? <Link href={n.link} className="hover:underline">{businessLabel(n.type, locale)}</Link> : businessLabel(n.type, locale)}
                  {!n.readAt ? <span className="badge ms-2 bg-gold-100 text-gold-600">{ct("New")}</span> : null}
                </p>
                <p className="mt-1 text-base text-navy-900">{[!user.agencyId ? n.agencyName : null, n.travellerName, n.destination, n.visaName].filter(Boolean).join(" · ")}</p>
                {n.reference ? <p className="text-xs text-slate-500"><bdi>{n.reference}</bdi></p> : null}
                <p className="mt-1 text-base text-slate-600">{["MESSAGE_POSTED", "DOCUMENT_REQUESTED"].includes(n.type) ? n.body : null}</p>
                <p className="mt-1 text-xs text-slate-400">{formatDateTime(n.createdAt, locale)}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                {n.link ? (
                  <Link href={n.link} className="btn-secondary btn-sm">
                    {ct(filter === "action" ? "Next action" : "Open")} <span aria-hidden="true" className="directional-arrow">→</span>
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
