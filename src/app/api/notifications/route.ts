import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { notificationBellEventsForUser, unreadNotificationCount } from "@/lib/queries";
import { businessLabel } from "@/lib/business-labels";
import { countryName } from "@/lib/country-names";
import { hasPermission } from "@/lib/rbac";
import { getUiLocale } from "@/lib/ui-i18n";

export const dynamic = "force-dynamic";
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  if (user.mustChangePassword) return NextResponse.json({ code: "PASSWORD_CHANGE_REQUIRED" }, { status: 403 });
  const locale = await getUiLocale();
  const [rows, unread] = await Promise.all([notificationBellEventsForUser(user.id,user.agencyId??undefined), unreadNotificationCount(user.id)]);
  return NextResponse.json({ unread, events: rows.map((n) => ({
    id: n.id, title: businessLabel(n.type, locale), link: user.agencyId&&(n.type.includes('WALLET')||n.type==='TOPUP_REQUESTED')&&!hasPermission(user,'wallet.view.own')?null:n.link,
    createdAt: n.createdAt.toISOString(),
    ...(user.agencyId ? {readAt:n.readAt?.toISOString()??null,type:n.type,applicationId:n.applicationId,context:[n.destination?countryName({name:n.destination,iso2:n.countryIso2},locale):null,n.reference].filter(Boolean).join(' · ')} : {}),
  })) }, { headers: { "Cache-Control": "private, no-store" } });
}
