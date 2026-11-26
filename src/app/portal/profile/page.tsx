import Link from "next/link";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { agencies, users } from "@/db/schema";
import { portalPageUser } from "@/lib/page-auth";
import { flashFrom } from "@/lib/action-helpers";
import { dateLocale, formatMonthYear, initials } from "@/lib/format";
import { identityT } from "@/lib/identity-copy";
import { Flash } from "@/components/ui";
import { hasPermission } from "@/lib/rbac";
import { agencyLogoUrl } from "@/lib/branding";
import { getUiLocale } from "@/lib/ui-i18n";
import { contentT } from "@/lib/i18n-content";
import { businessLabel } from "@/lib/business-labels";
import { profileCopy, profileTab } from "./profile-copy";
import { ContactEditor, LogoEditor } from "./profile-interactions";
import "./profile.css";
export const dynamic = "force-dynamic";
export default async function PortalProfilePage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const sp=await searchParams;
  const user=await portalPageUser();
  const locale=await getUiLocale();
  const ct=contentT(locale),it=identityT(locale),c=profileCopy(locale);
  const tab=profileTab(sp.tab);
  const canBill=hasPermission(user,"transactions.view.own");
  const canEdit=user.role==="AGENCY_ADMIN";
  const [agencyRows,team]=await Promise.all([
    db.select({id:agencies.id,legalName:agencies.legalName,tradingName:agencies.tradingName,email:agencies.email,phone:agencies.phone,addressLine:agencies.addressLine,city:agencies.city,country:agencies.country,createdAt:agencies.createdAt,logoKey:agencies.logoKey,logoUploadedAt:agencies.logoUploadedAt,
      billingName:canBill?agencies.billingName:sql<string|null>`null`,billingEmail:canBill?agencies.billingEmail:sql<string|null>`null`,billingTaxId:canBill?agencies.billingTaxId:sql<string|null>`null`}).from(agencies).where(eq(agencies.id,user.agencyId)).limit(1),
    tab==="agency"?Promise.resolve([]):db.select({id:users.id,name:users.name,email:users.email,role:users.role,status:users.status,activationPending:users.activationPending,mustChangePassword:users.mustChangePassword,lastLoginAt:users.lastLoginAt}).from(users).where(eq(users.agencyId,user.agencyId))
  ]);
  const agency=agencyRows[0];if(!agency)return null;
  const name=agency.tradingName||agency.legalName;
  const own=team.find(u=>u.id===user.id);
  const value=(s:string|null|undefined)=>s?.trim()||c.missing;
  const date=(d:Date|null|undefined)=>d?new Intl.DateTimeFormat(dateLocale(locale),{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"Africa/Algiers"}).format(d):c.never;
  return <div className="agency-profile-r01">
    <h1>{ct("Profile")}</h1><Flash {...flashFrom(sp)}/>
    <div className="profile-masthead">
      <div className="profile-identity">
        {tab==="agency"?<LogoEditor key={agency.logoUploadedAt?.toString()??"none"} src={agencyLogoUrl(agency)} name={name} initials={initials(name)} canEdit={canEdit} c={c}/>:<div className="profile-logo-mark">{agencyLogoUrl(agency)?<img src={agencyLogoUrl(agency)!} alt={name}/>:<span aria-hidden="true">{initials(name)}</span>}</div>}
        <div className="profile-name"><h2>{name}</h2><p>{ct("Partner since")} · {formatMonthYear(agency.createdAt,locale)}</p></div>
      </div>
    </div>
    <nav className="profile-tabs" aria-label={ct("Profile")}>
      {(["agency","account","team"] as const).map(t=><Link key={t} href={t==="agency"?"/portal/profile":"/portal/profile?tab="+t} aria-current={tab===t?"page":undefined} scroll={false}>{c[t]}</Link>)}
    </nav>
    <div className="profile-content">
      {tab==="agency"?<>
        <section className="profile-section"><header><h2>{c.identity}</h2></header><dl className="profile-fields"><div><dt>{ct("Legal name")}</dt><dd>{agency.legalName}</dd></div><div><dt>{ct("Trading name")}</dt><dd>{value(agency.tradingName)}</dd></div><div><dt>Email</dt><dd><bdi>{agency.email}</bdi></dd></div>{agency.country?<div><dt>{ct("Country")}</dt><dd>{agency.country}</dd></div>:null}</dl><p className="profile-note">{c.managed}</p></section>
        <ContactEditor key={[agency.phone,agency.city,agency.addressLine].join("|")} initial={{phone:agency.phone??"",city:agency.city??"",addressLine:agency.addressLine??""}} labels={{phone:ct("Phone"),city:ct("City"),addressLine:ct("Address")}} c={c} canEdit={canEdit}/>
        <section className="profile-section"><header><h2>{canBill?c.billing:ct("Wallet currency")}</h2></header><dl className="profile-fields">{canBill?<><div><dt>{ct("Legal name")}</dt><dd>{value(agency.billingName)}</dd></div><div><dt>Email</dt><dd><bdi>{value(agency.billingEmail)}</bdi></dd></div>{agency.billingTaxId?<div><dt>{ct("Tax ID")}</dt><dd><bdi>{agency.billingTaxId}</bdi></dd></div>:null}</>:null}<div><dt>{ct("Wallet currency")}</dt><dd>DZD</dd></div></dl></section>
      </>:tab==="account"?<>
        <section className="profile-section"><header><h2>{c.personal}</h2></header><dl className="profile-fields"><div><dt>{ct("Full name")}</dt><dd>{user.name}</dd></div><div><dt>Email</dt><dd><bdi>{user.email}</bdi></dd></div><div><dt>{ct("Role")}</dt><dd>{businessLabel(user.role,locale)}</dd></div>{user.username?<div><dt>{c.login}</dt><dd><bdi>{user.username}</bdi></dd></div>:null}</dl></section>
        <section className="profile-section"><header><h2>{c.security}</h2></header><Link href="/change-password" className="profile-security-row"><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></svg><span><strong>{it("Change password")}</strong><small>{c.passwordHint}</small></span><span className="profile-arrow" aria-hidden="true">→</span></Link><div className="profile-security-row"><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg><span><strong>{c.lastLogin}</strong><small>{date(own?.lastLoginAt)}</small></span></div></section>
      </>:<section className="profile-section"><header><h2>{c.access}</h2></header><div className="profile-team">{[...team].sort((a,b)=>Number(b.id===user.id)-Number(a.id===user.id)||a.name.localeCompare(b.name,locale)).map(u=><article key={u.id} className="profile-team-row"><div className="profile-avatar" aria-hidden="true">{initials(u.name)}</div><div className="profile-member"><strong>{u.name}{u.id===user.id?<small> · {c.you}</small>:null}</strong><small><bdi>{u.email}</bdi></small></div><div className="profile-member"><span>{businessLabel(u.role,locale)}</span><small><span className="profile-dot" data-active={u.status==="ACTIVE"&&!u.activationPending&&!u.mustChangePassword}/>{businessLabel(u.status,locale)}{u.activationPending?" · "+it("Pending activation"):u.mustChangePassword?" · "+it("Pending first password change"):""}</small></div><div className="profile-member"><small>{c.lastLogin}</small><span>{date(u.lastLoginAt)}</span></div></article>)}</div></section>}
    </div>
  </div>
}
