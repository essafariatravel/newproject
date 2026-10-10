import { adminPageUser } from "@/lib/page-auth";
import { activeSessions,securityOverview } from "@/lib/session-security";
import { revokeSessionAction,resetMfaAction } from "@/app/actions/security-center";
import {getUiLocale} from "@/lib/ui-i18n";
import {formatDateTime} from "@/lib/format";
import {MfaAuthorization} from "@/components/mfa-authorization";
import {securityCenterCopy} from "@/lib/security-copy";

export default async function SecurityPage(){
  const actor=await adminPageUser();
  const locale=await getUiLocale();
  const copy=securityCenterCopy(locale);
  const [rows,overview]=await Promise.all([activeSessions(actor),securityOverview(actor)]);
  return <section className="space-y-6"><h1 className="text-2xl font-semibold">{copy.title}</h1>
    <p>{copy.intro}</p>
    <p>{copy.lastLogin}: {overview.lastLoginAt?formatDateTime(overview.lastLoginAt,locale):"—"}</p>
    <h2 className="text-lg font-semibold">{copy.events}</h2><ul>{overview.events.map(event=><li key={event.id}>{formatDateTime(event.createdAt,locale)} · {event.action==="USER_LOGIN"?copy.loginEvent:event.action.startsWith("MFA_")?copy.mfaEvent:event.action.includes("SESSION")?copy.sessionEvent:copy.passwordEvent}</li>)}</ul>
    {actor.role==="SUPER_ADMIN"&&<MfaAuthorization staff={overview.staff} labels={{title:copy.authorize,instruction:copy.authorizationHelp,issue:copy.issue,error:copy.error}}/>}
    <ul className="space-y-3">{rows.map(row=><li key={row.id} className="rounded-xl border p-4"><p className="break-all">{row.userAgent??copy.unknown}</p><p>{copy.activity}: {formatDateTime(row.lastActivityAt,locale)}</p><p>{row.id===actor.sessionId?copy.current:copy.other}</p><form action={revokeSessionAction}><input type="hidden" name="id" value={row.id}/><button className="btn btn-secondary">{copy.revoke}</button></form></li>)}</ul>
    <form action={revokeSessionAction}><button className="btn btn-secondary">{copy.revokeAll}</button></form>
    {actor.role==="SUPER_ADMIN" && <form action={resetMfaAction} className="space-y-3"><h2 className="text-lg font-semibold">{copy.reset}</h2><p>{copy.resetHelp}</p><label className="block" htmlFor="reset-user">{copy.staff}</label><select className="input" id="reset-user" name="userId" required>{overview.staff.map(user=><option key={user.id} value={user.id}>{user.name} ({user.email})</option>)}</select><label className="block" htmlFor="reset-reason">{copy.reason}</label><input className="input" id="reset-reason" name="reason" minLength={10} maxLength={300} required/><label className="block" htmlFor="reset-password">{copy.password}</label><input className="input" id="reset-password" name="password" type="password" autoComplete="current-password" maxLength={200} required/><button className="btn btn-secondary">{copy.resetButton}</button></form>}
  </section>;
}
