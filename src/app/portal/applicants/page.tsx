import {TravellerProfileForm} from "./traveller-profile-form";
import {TravellerDirectorySearch} from "./traveller-directory-search";
import LegacyApplicantsPage from "./legacy-applicants";
import {hasPermission} from "@/lib/rbac";
import Link from "next/link";
import {portalPageUser} from "@/lib/page-auth";
import {getUiLocale} from "@/lib/ui-i18n";
import {directory,directoryCounts,directoryHistoricalDocuments} from "@/lib/traveller-hub";
import {vaultDirectorySummary} from "@/lib/traveller-vault";
import {hubCopy} from "@/lib/traveller-hub-copy";
import {directoryCopy,directoryFinishingCopy} from "@/lib/traveller-directory-copy";
import {expiryState,maskPassport,hubEnabled,vaultEnabled,profileIdentityComplete} from "@/lib/traveller-hub-policy";
import {algeriaToday} from "@/lib/travel-deadline";
import {formatDate} from "@/lib/format";
import {nationalityLabel,NATIONALITIES} from "@/lib/nationalities";
import {countryName} from "@/lib/country-names";
import {notFound} from "next/navigation";
export const dynamic="force-dynamic";
function initials(name:string){return name.trim().split(/\s+/).filter(Boolean).slice(0,2).map(n=>Array.from(n)[0]??"").join("").toUpperCase()||"—"}
export default async function TravellersPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 if(!hubEnabled())return <LegacyApplicantsPage searchParams={searchParams}/>;
 const user=await portalPageUser(),locale=await getUiLocale(),sp=await searchParams,t=hubCopy[locale],d=directoryCopy[locale],f=directoryFinishingCopy[locale],today=algeriaToday();
 if(!hasPermission(user,"applicants.view.all"))notFound();
 const canCreate=hasPermission(user,"applications.create"),canVault=vaultEnabled()&&hasPermission(user,"documents.view.all");
 const [data,counts]=await Promise.all([directory(user,sp.q,sp.page,sp.filter,sp.sort).catch(()=>null),directoryCounts(user,sp.q).catch(()=>null)]);
 if(!data)return <section className="th-hub"><h1>{t.title}</h1><p role="alert">{t.unavailable}</p><Link className="btn-secondary" href="/portal/applicants">{t.searchAction}</Link></section>;
 const [summary,historical]=canVault?await Promise.all([vaultDirectorySummary(user,data.rows.map(r=>r.id)).catch(()=>null),directoryHistoricalDocuments(user,data.rows.map(r=>r.id)).catch(()=>null)]):[null,null];
 const href=(filter:string,page=1)=>"/portal/applicants?"+new URLSearchParams({q:data.q,filter,page:String(page),sort:data.sort}).toString();
 const nf=new Intl.NumberFormat(locale);
 const keys=["all","renew","unknown",...(vaultEnabled()?["archived" as const]:[])] as const;
 return <section className="th-hub td-directory" dir={locale==="ar"?"rtl":"ltr"}>
 <header className="th-header td-heading"><div><h1>{t.title}</h1></div><div className="th-header-actions">{canCreate?<TravellerProfileForm locale={locale}/>:null}</div></header>
 <div className="td-controls"><nav className="th-tabs td-tabs" aria-label={d.filter}>{keys.map(k=><Link key={k} aria-current={data.filter===k?"page":undefined} href={href(k)}><span>{k==="archived"?d.archived:k==="unknown"?({fr:"À compléter",en:"Incomplete",ar:"تحتاج إلى استكمال"}[locale]):t[k]}</span>{counts?<span className="td-count">{nf.format(counts[k])}</span>:null}</Link>)}</nav>
 <TravellerDirectorySearch key={data.q+":"+data.filter+":"+data.sort} locale={locale} q={data.q} filter={data.filter} sort={data.sort}/>
 {data.q?<div className="td-results"><span>{nf.format(counts?.[data.filter]??data.total)} {d.results}</span><Link href={"/portal/applicants?"+new URLSearchParams({filter:data.filter,sort:data.sort}).toString()}>{d.clear}</Link></div>:null}</div>
 {data.rows.length?<div className={"td-list"+(vaultEnabled()?"":" td-no-vault")} role="table" aria-label={t.title}>
 <div role="row" className="td-row td-labels"><span role="columnheader">{t.name}</span><span role="columnheader">{t.passport}</span>{vaultEnabled()?<span role="columnheader" title={d.docsHint}>{d.vault}</span>:null}<span role="columnheader" className="td-numeric">{t.cases}</span><span role="columnheader">{t.recent}</span><span role="columnheader" className="td-actions-label">{f.actions}</span></div>
 {data.rows.map(r=>{const state=profileIdentityComplete(r.passport,r.expiry)?expiryState(r.expiry,today):"unknown",doc=summary?.[r.id],past=historical?.[r.id]??0,profile="/portal/applicants/"+r.id,country=r.country_name?countryName({name:r.country_name,iso2:NATIONALITIES.find(n=>n.en.toLowerCase()===r.country_name.toLowerCase())?.code},locale):"";
 return <div role="row" className="td-row td-record" key={r.id}><div role="cell" className="td-person"><Link className="td-person-link" href={profile}><span className="td-avatar" aria-hidden="true">{initials(r.name)}</span><span className="td-stack"><strong><bdi>{r.name||"—"}</bdi></strong><small>{nationalityLabel(r.nationality,locale)}</small></span></Link></div>
 <div role="cell" className="td-stack td-passport"><span className="td-mobile-label">{t.passport}</span><span className="td-passport-main">{r.passport?<bdi>{maskPassport(r.passport)}</bdi>:<span className="td-neutral">—</span>}{r.expiry?<small><span aria-hidden="true"> · </span>{formatDate(r.expiry,locale)}</small>:null}</span><small className="th-status" data-state={state}>{state==="unknown"?({fr:"Passeport à compléter",en:"Complete passport",ar:"استكمال جواز السفر"}[locale]):f[state]}</small>{state==="unknown"&&canCreate&&!r.archived_at?<Link className="booking-link" href={profile+"?complete=1"}>{({fr:"Compléter",en:"Complete",ar:"استكمال"}[locale])}</Link>:null}</div>
 {vaultEnabled()?<div role="cell" className="td-stack td-vault" title={d.docsHint}><span className="td-mobile-label">{d.vault}</span>{!canVault?<small>{d.restricted}</small>:summary===null||historical===null?<small>{d.unavailable}</small>:doc?.stored?<><span className="td-doc-count"><bdi>{nf.format(doc.stored)}</bdi> {f.saved}{past>0?<small title={nf.format(past)+" "+(past===1?f.historyOne:f.historyCount)}> · {nf.format(past)} {f.historyCount}</small>:null}</span><small className="th-status" data-state={doc.eligible===doc.stored?"valid":doc.eligible===0?"renew":"unknown"}><bdi>{nf.format(doc.eligible)}/{nf.format(doc.stored)}</bdi> {f.ready}</small></>:past>0?<><span>{f.history}</span><small>{nf.format(past)} {past===1?f.historyOne:f.historyCount}</small></>:<small>{f.empty}</small>}</div>:null}
 <div role="cell" className="td-numeric td-stack"><span className="td-mobile-label">{t.cases}</span><bdi>{nf.format(r.case_count)}</bdi></div><div role="cell" className="td-stack td-recent"><span className="td-mobile-label">{t.recent}</span>{r.application_id?<><Link href={"/portal/applications/"+r.application_id} className="td-case-link" title={r.reference}>{country||r.visa_type_name||r.reference}</Link><small><bdi>{r.reference}</bdi> · {formatDate(r.activity_at,locale)}</small></>:<><span>{d.noCase}</span><small>{d.created} · {formatDate(r.activity_at,locale)}</small></>}</div>
 <div role="cell" className="td-actions">{canCreate&&!r.archived_at?<Link className="td-icon-action td-repeat" href={"/portal/applications/new?traveller="+r.id} title={d.new} aria-label={d.new+" : "+r.name}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></Link>:null}<Link className="td-icon-action td-profile" href={profile} title={d.open} aria-label={d.open+" : "+r.name}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></Link></div></div>})}
 </div>:<div className="th-empty td-empty"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><circle cx="12" cy="8" r="3"/><path d="M5 20v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2"/></svg><h2>{d.empty}</h2><p>{data.q?d.emptySearch:d.emptyBase}</p><Link className="btn-secondary" href="/portal/applicants">{d.all}</Link></div>}
 {data.page>1||data.hasNext?<nav className="th-pages td-pages" aria-label={t.page}>{data.page>1?<Link href={href(data.filter,data.page-1)}>{t.previous}</Link>:<span/>}<span>{t.page} <bdi>{data.page}</bdi></span>{data.hasNext?<Link href={href(data.filter,data.page+1)}>{t.next}</Link>:<span/>}</nav>:null}
 </section>
}
