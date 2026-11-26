import Link from "next/link";
import { and, eq, sql } from "drizzle-orm";
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
import { readAgencyPrefs } from "@/lib/agency-preferences";
import { personalProfileSecurity } from "@/lib/agency-profile-security";
import { NATIONALITIES,nationalityLabel } from "@/lib/nationalities";
import { activeVisaOptions } from "@/lib/queries";
import { countryName } from "@/lib/country-names";
import { getSiteSettings } from "@/lib/settings";
import { publicContactDetails } from "@/lib/public-contact";
import { UiLanguageSwitcher } from "@/components/ui-language-switcher";
import { PreferencesForm,SessionDisconnect,UsernameReveal } from "./profile-extras";
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
  const [agencyRows,team,security,prefs,options,contact]=await Promise.all([
    db.select({id:agencies.id,legalName:agencies.legalName,tradingName:agencies.tradingName,email:agencies.email,phone:agencies.phone,addressLine:agencies.addressLine,city:agencies.city,country:agencies.country,createdAt:agencies.createdAt,logoKey:agencies.logoKey,logoUploadedAt:agencies.logoUploadedAt,
      billingName:canBill?agencies.billingName:sql<string|null>`null`,billingEmail:canBill?agencies.billingEmail:sql<string|null>`null`,billingTaxId:canBill?agencies.billingTaxId:sql<string|null>`null`}).from(agencies).where(eq(agencies.id,user.agencyId)).limit(1),
    tab!=="account"&&tab!=="team"?Promise.resolve([]):db.select({id:users.id,name:users.name,email:users.email,role:users.role,status:users.status,activationPending:users.activationPending,mustChangePassword:users.mustChangePassword,lastLoginAt:users.lastLoginAt}).from(users).where(tab==="account"?and(eq(users.agencyId,user.agencyId),eq(users.id,user.id)):eq(users.agencyId,user.agencyId)),
    tab==="account"?personalProfileSecurity(user).catch(()=>null):null,
    tab==="preferences"?readAgencyPrefs(user.id):null,
    tab==="preferences"?activeVisaOptions().catch(()=>null):null,
    tab==="support"?getSiteSettings().then(publicContactDetails).catch(()=>null):null
  ]);
  const agency=agencyRows[0];if(!agency)return null;
  const name=agency.tradingName||agency.legalName;
  const own=team.find(u=>u.id===user.id);
  const value=(s:string|null|undefined)=>s?.trim()||c.missing;
  const date=(d:Date|null|undefined)=>d?new Intl.DateTimeFormat(dateLocale(locale),{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"Africa/Algiers"}).format(d):c.never;
  const missingContact=[agency.phone,agency.city,agency.addressLine].some(v=>!v?.trim());
  const eventNames:Record<string,string>={USER_LOGIN:c.loginEvent,PASSWORD_CHANGED:c.passwordEvent,SESSION_REVOKED:c.sessionEvent,AGENCY_OTHER_SESSIONS_REVOKED:c.sessionEvent,AGENCY_CONTACT_UPDATED:c.contactEvent,AGENCY_LOGO_UPLOADED:c.logoEvent,AGENCY_LOGO_REMOVED:c.logoRemoved};
  const deviceLabel=(ua:string|null)=>{if(!ua)return c.unknownDevice;const browser=/Edg\//i.test(ua)?"Edge":/Firefox\//i.test(ua)?"Firefox":/Chrome\//i.test(ua)?"Chrome":/Safari\//i.test(ua)?"Safari":c.unknownDevice;const os=/Android/i.test(ua)?"Android":/iPhone|iPad/i.test(ua)?"iOS":/Windows/i.test(ua)?"Windows":/Macintosh/i.test(ua)?"macOS":/Linux/i.test(ua)?"Linux":"";return [browser,os].filter(Boolean).join(" · ")};
  const destinations=options?Array.from(new Map(options.map(v=>[v.countryId,{id:v.countryId,name:countryName({name:v.countryName,iso2:v.countryIso2},locale)}])).values()).sort((a,b)=>a.name.localeCompare(b.name,locale)):[];
  return <div className="agency-profile-r01">
    <h1>{ct("Profile")}</h1><Flash {...flashFrom(sp)}/>
    <div className="profile-masthead">
      <div className="profile-identity">
        {tab==="agency"?<LogoEditor key={agency.logoUploadedAt?.toString()??"none"} src={agencyLogoUrl(agency)} name={name} initials={initials(name)} canEdit={canEdit} c={c}/>:<div className="profile-logo-mark">{agencyLogoUrl(agency)?<img src={agencyLogoUrl(agency)!} alt={name}/>:<span aria-hidden="true">{initials(name)}</span>}</div>}
        <div className="profile-name"><h2>{name}</h2><p>{ct("Partner since")} · {formatMonthYear(agency.createdAt,locale)}</p></div>
      </div>
    </div>
    <nav className="profile-tabs" aria-label={ct("Profile")}>
      {(["agency","account","team","preferences","support"] as const).map(t=><Link key={t} href={t==="agency"?"/portal/profile":"/portal/profile?tab="+t} aria-current={tab===t?"page":undefined} scroll={false}>{c[t]}</Link>)}
    </nav>
    <div className="profile-content">
      {tab==="agency"?<>
        {canEdit&&missingContact?<div className="profile-attention"><strong>{c.completeTitle}</strong><a href="#profile-contact">{c.editContact} <span aria-hidden="true">→</span></a></div>:null}
        <section className="profile-section"><header><h2>{c.identity}</h2></header><dl className="profile-fields"><div><dt>{ct("Legal name")}</dt><dd>{agency.legalName}</dd></div><div><dt>{ct("Trading name")}</dt><dd>{value(agency.tradingName)}</dd></div><div><dt>{ct("Email")}</dt><dd><bdi>{agency.email}</bdi></dd></div>{agency.country?<div><dt>{ct("Country")}</dt><dd>{agency.country}</dd></div>:null}</dl><p className="profile-note">{c.managed}</p></section>
        <ContactEditor key={[agency.phone,agency.city,agency.addressLine].join("|")} initial={{phone:agency.phone??"",city:agency.city??"",addressLine:agency.addressLine??""}} labels={{phone:ct("Phone"),city:ct("City"),addressLine:ct("Address")}} c={c} canEdit={canEdit}/>
        <section className="profile-section"><header><h2>{canBill?c.billing:ct("Wallet currency")}</h2></header><dl className="profile-fields">{canBill?<><div><dt>{ct("Legal name")}</dt><dd>{value(agency.billingName)}</dd></div><div><dt>{ct("Email")}</dt><dd><bdi>{value(agency.billingEmail)}</bdi></dd></div>{agency.billingTaxId?<div><dt>{ct("Billing tax ID")}</dt><dd><bdi>{agency.billingTaxId}</bdi></dd></div>:null}</>:null}<div><dt>{ct("Wallet currency")}</dt><dd>DZD</dd></div></dl></section>
      </>:tab==="account"?<>
        <section className="profile-section"><header><h2>{c.personal}</h2></header><dl className="profile-fields"><div><dt>{ct("Full name")}</dt><dd>{user.name}</dd></div><div><dt>{ct("Email")}</dt><dd><bdi>{user.email}</bdi></dd></div><div><dt>{ct("Role")}</dt><dd>{businessLabel(user.role,locale)}</dd></div>{user.username?<div><dt>{c.login}</dt><dd><UsernameReveal username={user.username} c={c}/></dd></div>:null}</dl></section>
        <section className="profile-section"><header><h2>{c.security}</h2></header><Link href="/change-password" className="profile-security-row"><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></svg><span><strong>{it("Change password")}</strong><small>{c.passwordHint}</small></span><span className="profile-arrow" aria-hidden="true">→</span></Link><div className="profile-security-row"><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg><span><strong>{c.lastLogin}</strong><small>{date(own?.lastLoginAt)}</small></span></div></section>
        <section className="profile-section"><header><h2>{c.devices}</h2>{security&&security.devices.some(d=>d.id!==user.sessionId)?<SessionDisconnect target="all" c={c} all/>:null}</header>{!security?<p>{c.unavailable}</p>:<>{security.devices.map(d=><div className="profile-setting-row" key={d.id}><div><strong>{deviceLabel(d.userAgent)}</strong><p>{c.lastActivity} · {date(d.lastActivityAt)}</p></div>{d.id===user.sessionId?<span className="profile-current">{c.current}</span>:<SessionDisconnect target={d.id} c={c}/>}</div>)}{!security.devices.some(d=>d.id!==user.sessionId)?<p className="profile-note">{c.noOther}</p>:null}</>}</section>
        <section className="profile-section"><header><h2>{c.activity}</h2></header><p className="profile-note">{c.historyHint}</p>{!security?<p>{c.unavailable}</p>:security.events.length?security.events.map(e=><div className="profile-setting-row" key={e.id}><strong>{eventNames[e.action]}</strong><time dateTime={e.createdAt.toISOString()}>{date(e.createdAt)}</time></div>):<p className="profile-note">{c.noActivity}</p>}</section>
      </>:tab==="team"?<section className="profile-section"><header><h2>{c.access}</h2></header><div className="profile-team">{[...team].sort((a,b)=>Number(b.id===user.id)-Number(a.id===user.id)||a.name.localeCompare(b.name,locale)).map(u=><article key={u.id} className="profile-team-row"><div className="profile-avatar" aria-hidden="true">{initials(u.name)}</div><div className="profile-member"><strong>{u.name}{u.id===user.id?<small> · {c.you}</small>:null}</strong><small><bdi>{u.email}</bdi></small></div><div className="profile-member"><span>{businessLabel(u.role,locale)}</span><small><span className="profile-dot" data-active={u.status==="ACTIVE"&&!u.activationPending&&!u.mustChangePassword}/>{businessLabel(u.status,locale)}{u.activationPending?" · "+it("Pending activation"):u.mustChangePassword?" · "+it("Pending first password change"):""}</small></div><div className="profile-member"><small>{c.lastLogin}</small><span>{date(u.lastLoginAt)}</span></div></article>)}</div><p className="profile-note">{c.teamHint} <Link className="profile-text-action" href="/portal/profile?tab=support">{c.support} →</Link></p></section>:tab==="preferences"?<section className="profile-section"><header><h2>{c.workspace}</h2></header><div className="profile-setting-row"><strong>{c.language}</strong><UiLanguageSwitcher locale={locale} nextPath="/portal/profile?tab=preferences"/></div>{prefs&&options?<PreferencesForm key={JSON.stringify(prefs)} prefs={prefs} c={c} nationalities={NATIONALITIES.map(n=>({code:n.code,label:nationalityLabel(n.code,locale)})).sort((a,b)=>a.label.localeCompare(b.label,locale))} destinations={destinations}/>:<p>{c.unavailable}</p>}</section>:<section className="profile-section"><header><h2>{c.supportTitle}</h2></header><p className="profile-note">{c.supportBody}</p>{contact?.email?<div className="profile-setting-row"><strong>{ct("Email")}</strong><a className="profile-text-action" href={"mailto:"+contact.email}><bdi>{contact.email}</bdi></a></div>:null}{contact?.phone?<div className="profile-setting-row"><strong>{ct("Phone")}</strong><a className="profile-text-action" href={"tel:"+contact.phone.replace(/[^+0-9]/g,"")}><bdi>{contact.phone}</bdi></a></div>:null}{contact?.officeHours?<div className="profile-setting-row"><strong>{c.hours}</strong><span>{contact.officeHours}</span></div>:null}<Link className="profile-setting-row" href="/contact"><strong>{c.contactUs}</strong><span aria-hidden="true">→</span></Link><Link className="profile-setting-row" href="/portal/communications"><strong>{c.caseMessages}</strong><span aria-hidden="true">→</span></Link></section>}
    </div>
  </div>
}
