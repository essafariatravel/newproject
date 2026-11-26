import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { notificationBellEventsForUser, unreadNotificationCount } from "@/lib/queries";
import { businessLabel } from "@/lib/business-labels";
import { agencyBellEvents } from "@/lib/agency-notification-bell";
import { hasPermission } from "@/lib/rbac";
import { getUiLocale } from "@/lib/ui-i18n";
import { agencyNotificationScope } from "@/lib/notification-scope";
import { coreTimed } from "@/lib/core-timing";

export const dynamic = "force-dynamic";
export async function GET(request?:Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  if (user.mustChangePassword) return NextResponse.json({ code: "PASSWORD_CHANGE_REQUIRED" }, { status: 403 });
  const locale = await getUiLocale();
  const expected=request?.headers.get("X-Essafaria-Notification-Scope");
  const probe=request?.headers.get("X-Essafaria-Notification-Probe")==="1";
  if(process.env.VERCEL_ENV==="production"&&(expected||probe))return NextResponse.json({code:"FORBIDDEN"},{status:403,headers:{"Cache-Control":"private, no-store"}});
  if(user.agencyId){
    const financial=hasPermission(user,"wallet.view.own")&&hasPermission(user,"transactions.view.own");
    const scope=agencyNotificationScope(user,locale,financial);
    if((expected!==null&&expected!==undefined&&(!scope||expected!==scope))||(probe&&(!scope||expected!==scope)))return NextResponse.json({code:"FORBIDDEN"},{status:403,headers:{"Cache-Control":"private, no-store"}});
    if(probe)return NextResponse.json({scope},{headers:{"Cache-Control":"private, no-store"}});
    const [events,unread]=await coreTimed("agency.notifications.read",()=>Promise.all([agencyBellEvents(user.id,user.agencyId!,locale,financial),unreadNotificationCount(user.id)]));
    return NextResponse.json({unread,events},{headers:{"Cache-Control":"private, no-store"}});
  }
  if(expected||probe)return NextResponse.json({code:"FORBIDDEN"},{status:403,headers:{"Cache-Control":"private, no-store"}});
  const [rows, unread] = await Promise.all([notificationBellEventsForUser(user.id,user.agencyId??undefined), unreadNotificationCount(user.id)]);
  return NextResponse.json({ unread, events: rows.map((n) => ({
    id: n.id, title: businessLabel(n.type, locale), link: user.agencyId&&(n.type.includes('WALLET')||n.type==='TOPUP_REQUESTED')&&!hasPermission(user,'wallet.view.own')?null:n.link,
    createdAt: n.createdAt.toISOString(),
  })) }, { headers: { "Cache-Control": "private, no-store" } });
}
