import Link from "next/link";
import { logoutAction } from "@/app/actions/auth";
import { contentT } from "@/lib/i18n-content";
import { initials } from "@/lib/format";
import type { AuthUser } from "@/lib/types";
import type { UiLocale } from "@/lib/ui-i18n";

export function AccountMenu({user,locale}:{user:AuthUser;locale:UiLocale}) {
  const ct=contentT(locale);
  return <details className="account-menu">
    <summary aria-label={ct("My account")}><span className="account-avatar">{initials(user.name)}</span><span className="account-menu-identity"><strong>{user.name}</strong><small>{user.agencyName ?? user.email}</small></span><svg className="account-chevron" width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5"/></svg></summary>
    <div className="account-menu-panel">
      <p>{user.name}</p>
      <Link href={user.agencyId ? "/portal/profile" : "/change-password"}>{ct("My account")}</Link>
      {user.role === "AGENCY_ADMIN" ? <Link href="/portal/profile">{ct("Agency profile")}</Link> : null}
      <Link href="/change-password">{ct("Change password")}</Link>
      <form action={logoutAction}><button type="submit">{ct("Sign out")}</button></form>
    </div>
  </details>;
}
