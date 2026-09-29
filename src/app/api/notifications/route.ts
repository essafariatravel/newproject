import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { listNotificationsForUser, unreadNotificationCount } from "@/lib/queries";
import { businessLabel } from "@/lib/business-labels";
import { getUiLocale } from "@/lib/ui-i18n";

export const dynamic = "force-dynamic";
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  if (user.mustChangePassword) return NextResponse.json({ code: "PASSWORD_CHANGE_REQUIRED" }, { status: 403 });
  const locale = await getUiLocale();
  const [rows, unread] = await Promise.all([listNotificationsForUser(user.id), unreadNotificationCount(user.id)]);
  return NextResponse.json({ unread, events: rows.slice(0, 20).map((n) => ({
    id: n.id, title: businessLabel(n.type, locale), link: n.link,
    createdAt: n.createdAt.toISOString(),
  })) }, { headers: { "Cache-Control": "private, no-store" } });
}
