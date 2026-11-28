import {TravellerProfileForm} from "./traveller-profile-form";
import LegacyApplicantsPage from "./legacy-applicants";
import {hasPermission} from "@/lib/rbac";
import Link from "next/link";
import {portalPageUser} from "@/lib/page-auth";
import {getUiLocale} from "@/lib/ui-i18n";
import {directory} from "@/lib/traveller-hub";
import {hubCopy} from "@/lib/traveller-hub-copy";
import {expiryState,maskPassport,hubEnabled} from "@/lib/traveller-hub-policy";
import {algeriaToday} from "@/lib/travel-deadline";
import {formatDate} from "@/lib/format";
import {nationalityLabel} from "@/lib/nationalities";
import {notFound} from "next/navigation";
export const dynamic="force-dynamic";
export default async function TravellersPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 if(!hubEnabled())return <LegacyApplicantsPage searchParams={searchParams}/>;
 const user=await portalPageUser(),locale=await getUiLocale(),sp=await searchParams,t=hubCopy[locale],today=algeriaToday();
 if(!hasPermission(user,"applicants.view.all"))notFound();
 const data=await directory(user,sp.q,sp.page,sp.filter).catch(()=>null);
 if(!data)return <section className="th-hub"><h1>{t.title}</h1><p role="alert">{t.unavailable}</p><Link className="btn-secondary" href="/portal/applicants">{t.searchAction}</Link></section>;
 const href=(filter:string,page=1)=>"/portal/applicants?"+new URLSearchParams({q:data.q,filter,page:String(page)}).toString();
 return <section className="th-hub" dir={locale==="ar"?"rtl":"ltr"}><header className="th-header"><h1>{t.title}</h1><div className="th-header-actions">{hasPermission(user,"applications.create")?<TravellerProfileForm locale={locale}/>:null}</div></header>
 <form className="th-search" action="/portal/applicants"><label className="sr-only" htmlFor="traveller-q">{t.search}</label><input id="traveller-q" name="q" type="search" maxLength={100} defaultValue={data.q} placeholder={t.search} className="input"/><input type="hidden" name="filter" value={data.filter}/><button className="btn-secondary">{t.searchAction}</button></form>
 <nav className="th-tabs" aria-label={t.title}>{(["all","renew","unknown"] as const).map(k=><Link key={k} aria-current={data.filter===k?"page":undefined} href={href(k)}>{t[k]}</Link>)}</nav>
 {data.rows.length?<div className="th-table"><div className="th-table-head"><span>{t.name}</span><span>{t.passport}</span><span>{t.cases}</span><span>{t.recent}</span></div>{data.rows.map(r=>{const state=expiryState(r.expiry,today);return <Link key={r.id} href={"/portal/applicants/"+r.id} className="th-table-row"><span><strong>{r.name||"—"}</strong><small>{nationalityLabel(r.nationality,locale)}</small></span><span><bdi>{maskPassport(r.passport)}</bdi>{r.expiry?<small>{formatDate(r.expiry,locale)}</small>:null}<small className="th-status" data-state={state}>{state==="valid"?t.valid:state==="renew"?t.renewState:state==="expired"?t.expired:t.unknownState}</small></span><span><bdi>{r.case_count}</bdi></span><span><bdi>{r.reference}</bdi><small>{formatDate(r.activity_at,locale)} <span aria-hidden="true">→</span></small></span></Link>})}</div>:<p className="th-empty">{t.empty}</p>}
 {data.page>1||data.hasNext?<nav className="th-pages" aria-label={t.page}>{data.page>1?<Link href={href(data.filter,data.page-1)}>{t.previous}</Link>:<span/>}<span>{t.page} <bdi>{data.page}</bdi></span>{data.hasNext?<Link href={href(data.filter,data.page+1)}>{t.next}</Link>:<span/>}</nav>:null}
 </section>
}
