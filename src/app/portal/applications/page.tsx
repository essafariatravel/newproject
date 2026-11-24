import Link from "next/link";
import { and, count, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, statuses as statusTable } from "@/db/schema";
import { qualifiedTable } from "@/lib/database-schema";
import { configName } from "@/lib/config-localization";
import { portalPageUser } from "@/lib/page-auth";
import { searchApplications, resolvePageSize, buildApplicationConditions, type ApplicationFilters } from "@/lib/queries";
import { checklistProgressForApplications, listStatuses } from "@/lib/applications";
import { flashFrom } from "@/lib/action-helpers";
import { formatAmount, formatDate, formatProcessingDays } from "@/lib/format";
import { Pagination, PageSizeSelector } from "@/components/app-widgets";
import { localizedStatusName, getUiLocale } from "@/lib/ui-i18n";
import { Flash } from "@/components/ui";
import { StatusBadge } from "@/components/badges";
import { contentT } from "@/lib/i18n-content";
import { countryName } from "@/lib/country-names";
import { NavigableTableRow } from "@/components/navigable-table-row";
import { hasPermission } from "@/lib/rbac";
import { CountryFlag } from "../dashboard-interactions";
import { caseAction } from "../dashboard-smart";
import { CaseFilters } from "./case-filters";
import { caseLink, queueFilters, caseSort, detailLink, processingDuration, durationLabel, caseDateTime, caseResponsibility, caseQueryFilters, type CaseQueue } from "./case-workspace";
import { CaseQuickView, CaseQuickViewProvider } from "./case-quick-view";
import { CaseSelectionProvider, CaseSelect, CaseSelectAll, CaseSelectionToolbar } from "./case-selection";
import { CaseListMemory } from "./case-navigation";
import { agencyAttentionCondition } from "@/lib/attention";
import "./cases.css";

export const dynamic = "force-dynamic";

export default async function PortalApplicationsPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
 const raw=await searchParams;
 const locale=await getUiLocale(raw), ct=contentT(locale), user=await portalPageUser();
 const sp:Record<string,string|undefined>={};
 for(const [k,v] of Object.entries(raw))sp[k]=typeof v==="string"?v:undefined;
 const queue:CaseQueue=sp.documents==="requested"?"attention":sp.queue==="active"?"active":sp.queue==="completed"?"completed":"all";
 const page=Math.min(100000,Math.max(1,Math.floor(Number(sp.page)||1)));
 const per=resolvePageSize(sp.per);
 const filters:ApplicationFilters=caseQueryFilters(sp),from=filters.dateFrom,to=filters.dateTo,country=filters.countryId;
 const shared={q:sp.q,status:sp.status,from,to,per:sp.per,country,sort:caseSort(sp.sort),missing:sp.missing==="1"?"1":undefined,focus:filters.caseFocus};
 const query={...shared,...queueFilters(queue)};
 const hasFilters=Boolean(sp.q||sp.status||from||to||country||sp.missing==="1"||filters.caseFocus);
 const copy={
  fr:{all:"Tous",active:"Actifs",attention:"Action requise",completed:"Terminés",traveller:"Voyageur",destination:"Destination / visa",action:"Action",filters:"Filtres",search:"Nom, référence, pays ou visa…",suggestions:"Suggestions de dossiers",searching:"Recherche…",unavailable:"Suggestions indisponibles. La recherche reste accessible.",noSuggestions:"Aucune suggestion.",ready:"Vous êtes à jour",readyBody:"Aucun dossier ne nécessite votre intervention.",emptyQueue:"Aucun dossier dans cette vue.",decision:"Voir le dossier",cancelled:"Consulter l’annulation",cancellation:"Suivre l’annulation",documents:"Compléter les documents",openDocuments:"Consulter les documents",none:"Aucune action nécessaire",docsComplete:"Documents complets",docsPending:"Documents à compléter",loading:"Chargement des dossiers…"},
  en:{all:"All",active:"Active",attention:"Action required",completed:"Completed",traveller:"Traveller",destination:"Destination / visa",action:"Action",filters:"Filters",search:"Name, reference, country or visa…",suggestions:"Case suggestions",searching:"Searching…",unavailable:"Suggestions unavailable. Search is still available.",noSuggestions:"No suggestions.",ready:"You're up to date",readyBody:"No case requires your attention.",emptyQueue:"No cases in this view.",decision:"View case",cancelled:"View cancellation",cancellation:"Track cancellation",documents:"Complete documents",openDocuments:"View documents",none:"No action required",docsComplete:"Documents complete",docsPending:"Documents incomplete",loading:"Loading cases…"},
  ar:{all:"الكل",active:"النشطة",attention:"إجراء مطلوب",completed:"المكتملة",traveller:"المسافر",destination:"الوجهة / التأشيرة",action:"الإجراء",filters:"التصفية",search:"الاسم أو المرجع أو البلد أو التأشيرة…",suggestions:"اقتراحات الطلبات",searching:"جارٍ البحث…",unavailable:"الاقتراحات غير متاحة. لا يزال البحث متاحًا.",noSuggestions:"لا توجد اقتراحات.",ready:"أنت على اطلاع بكل المستجدات",readyBody:"لا توجد طلبات تتطلب تدخلك.",emptyQueue:"لا توجد طلبات في هذا العرض.",decision:"عرض الملف",cancelled:"عرض الإلغاء",cancellation:"متابعة الإلغاء",documents:"استكمال الوثائق",openDocuments:"عرض الوثائق",none:"لا يوجد إجراء مطلوب",docsComplete:"الوثائق مكتملة",docsPending:"الوثائق غير مكتملة",loading:"جارٍ تحميل الطلبات…"}
 }[locale];
 const queues:CaseQueue[]=["all","active","attention","completed"];
 const toFilters=(key:CaseQueue):ApplicationFilters=>({...filters,...queueFilters(key)});
 const [result,statuses,aggregate,countryRows]=await Promise.all([
 searchApplications(user,{...toFilters(queue),page,pageSize:per}),listStatuses(true),
 buildApplicationConditions(user,filters).then(conditions=>db.select({all:count(),active:sql<number>`count(*) filter(where not ${statusTable.isTerminal})::int`,attention:sql<number>`count(*) filter(where ${agencyAttentionCondition()})::int`,completed:sql<number>`count(*) filter(where ${statusTable.isTerminal})::int`}).from(applications).innerJoin(statusTable,eq(applications.statusId,statusTable.id)).where(and(...conditions))),
 db.selectDistinct({id:applications.countryId,name:applications.countryName}).from(applications).where(eq(applications.agencyId,user.agencyId))
 ]);
 const counts=queues.map(key=>key===queue?result.total:Number(aggregate[0]?.[key]??0));
 const ids=result.rows.map(r=>r.app.id);
 const [checklists,pendingRows]=await Promise.all([
   checklistProgressForApplications(ids,true),
   ids.length?db.select({id:applications.id,pending:sql<boolean>`exists(select 1 from ${sql.raw(qualifiedTable("application_cancellation_requests"))} r where r.application_id=${applications.id} and r.status='PENDING')`}).from(applications).where(and(eq(applications.agencyId,user.agencyId),inArray(applications.id,ids))).catch(()=>[]):Promise.resolve([])
 ]);
 const pendingIds=new Set(pendingRows.filter(r=>r.pending).map(r=>r.id));
 const canUpload=hasPermission(user,"documents.upload.own");
 const canCreate=hasPermission(user,"applications.create");
 const rows=result.rows.map(r=>{
   const base=detailLink(r.app.id,caseLink({...query,page:String(result.page)}));
   const separator=base.includes("?")?"&":"?";
   const requested=r.agencyNextAction==="Upload requested documents";
   const action=caseAction(r.statusCode,requested,pendingIds.has(r.app.id));
   const actionHref=action==="documents"?base+separator+"tab=documents":action==="cancellation"||action==="cancelled"?base+"#cancellation":base;
   const actionText=action==="documents"?(canUpload?copy.documents:copy.openDocuments):action==="view"?r.isTerminal?copy.decision:null:copy[action];
   const p=checklists.get(r.app.id);
   const elapsed=processingDuration(r.app.submittedAt,r.app.decisionAt,r.app.completedAt,r.isTerminal||["APPROVED","REJECTED","REFUSED","COMPLETED","CANCELLED"].includes(r.statusCode));
   return {id:r.app.id,base,actionHref,actionText,action,elapsed:elapsed?durationLabel(elapsed.minutes,locale):null,terminal:elapsed?.terminal??false,traveller:r.applicantSummary??"—",reference:r.app.reference,country:countryName({name:r.app.countryName,iso2:r.countryIso2},locale),iso:r.countryIso2??"",visa:configName({name:r.app.visaTypeName,nameFr:r.visaNameFr,nameAr:r.visaNameAr},locale),progress:p?{done:p.requiredComplete,total:p.requiredTotal}:null,fee:formatAmount(r.app.effectivePrice??r.app.fee,"DZD",locale),estimate:formatProcessingDays(r.app.processingMinDays,r.app.processingMaxDays,locale),responsibility:caseResponsibility(r.statusCode,r.isTerminal,requested,pendingIds.has(r.app.id)),status:r.statusCode,statusName:r.statusName,updated:caseDateTime(r.app.updatedAt,locale),created:formatDate(r.app.createdAt,locale)};
 });
 const recent=rows.slice(0,5).map(r=>({id:r.id,title:r.traveller,detail:r.reference+" · "+r.country,href:r.base,aliases:[r.country,r.visa,r.reference]}));
 const labels={search:ct("Search"),placeholder:locale==="fr"?"Nom, référence, passeport, pays ou visa…":locale==="en"?"Name, reference, passport, country or visa…":"الاسم أو المرجع أو جواز السفر أو البلد أو التأشيرة…",filters:copy.filters,status:ct("Status"),all:ct("All"),from:ct("From"),to:ct("To"),apply:ct("Filter"),reset:ct("Reset"),suggestions:copy.suggestions,searching:copy.searching,unavailable:copy.unavailable,noSuggestions:copy.noSuggestions,loading:copy.loading};
 const resetHref=caseLink({...queueFilters(queue),per:sp.per,sort:caseSort(sp.sort)});
 const documents=(r:typeof rows[number])=>r.progress?<span className="case-docs" data-complete={r.progress.done>=r.progress.total} title={r.progress.done>=r.progress.total?copy.docsComplete:copy.docsPending}><bdi>{r.progress.done}/{r.progress.total}</bdi>{r.progress.total>0&&r.progress.done>=r.progress.total?<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m3 8 3 3 7-7"/></svg>:null}</span>:<span>—</span>;
 const quickRows=rows.map(r=>({id:r.id,href:r.base,traveller:r.traveller,reference:r.reference,destination:r.country+" · "+r.visa,status:localizedStatusName(r.status,r.statusName,locale),statusCode:r.status,responsibility:r.responsibility,estimate:r.estimate,elapsed:r.elapsed,updated:r.updated,fee:r.fee,progress:r.progress?`${r.progress.done}/${r.progress.total}`:"—",actionHref:r.actionHref,actionText:r.actionText,official:["APPROVED","REJECTED"].includes(r.status)}));
 const quick=(r:typeof rows[number],decision=false)=><CaseQuickView id={r.id} reference={r.reference} decisionTrigger={decision} locale={locale}/>;
 const action=(r:typeof rows[number])=>["APPROVED","REJECTED"].includes(r.status)?quick(r,true):r.actionText?<Link className="case-action" href={r.actionHref}>{r.actionText}<span aria-hidden="true" className="case-arrow">→</span></Link>:<span className="case-none" aria-label={copy.none}>—</span>;
 const state=(r:typeof rows[number])=><div className="case-status-cell"><span className="case-state" data-status={r.status}><StatusBadge code={r.status} name={r.statusName}/></span>{r.elapsed?<small>{r.terminal?({fr:"Durée :",en:"Duration:",ar:"المدة:"}[locale]):({fr:"Depuis",en:"Since",ar:"منذ"}[locale])} <bdi>{r.elapsed}</bdi></small>:null}</div>;
 return <div className="essafaria-cases" dir={locale==="ar"?"rtl":"ltr"}><CaseQuickViewProvider rows={quickRows} locale={locale}><CaseSelectionProvider key={caseLink({...query,page:String(result.page)})} locale={locale} rows={rows.map(r=>({id:r.id,reference:r.reference,traveller:r.traveller,country:r.country,visa:r.visa,status:localizedStatusName(r.status,r.statusName,locale),fee:r.fee,updated:r.updated}))}><CaseListMemory scope={user.id} context={caseLink({...query,page:String(result.page)})} rows={rows.map(r=>({id:r.id,href:r.base}))}/>
   <header className="case-title"><h1>{ct("Applications")}</h1></header>
   <Flash {...flashFrom(sp)}/>
   <nav className="case-queues" aria-label={ct("Applications")}>
     {queues.map((key,i)=><Link key={key} href={caseLink({...shared,...queueFilters(key)})} aria-current={queue===key?"page":undefined}><span>{copy[key]}</span><span className="case-count">{counts[i]}</span></Link>)}
   </nav>
   <CaseFilters key={caseLink(query)} locale={locale} labels={labels} query={query} currentPage={result.page} recent={recent} statuses={statuses.map(s=>({value:s.code,label:localizedStatusName(s.code,s.name,locale)}))} countries={Array.from(new Map(countryRows.map(r=>[r.id,{value:r.id,label:r.name}])).values()).sort((a,b)=>a.label.localeCompare(b.label,locale))} resetHref={resetHref}/>
   {rows.length===0?<section className="case-empty" role="status">
     <h2>{hasFilters?ct("No applications match these filters."):queue==="attention"?copy.ready:queue==="all"?ct("No applications yet"):copy.emptyQueue}</h2>
     <p>{hasFilters?ct("Adjust or clear the filters to see other applications."):queue==="attention"?copy.readyBody:queue==="all"?ct("Submit your first visa application to see it tracked here."):""}</p>
     {hasFilters?<Link className="btn-secondary" href={resetHref}>{ct("Clear filters")}</Link>:queue!=="all"?<Link className="btn-secondary" href={caseLink({per:sp.per})}>{ct("All applications")}</Link>:canCreate?<Link className="btn-primary" href="/portal/applications/new">{ct("Create application")}</Link>:null}
   </section>:<>
     <CaseSelectionToolbar/><div className="case-desktop">
       <table className="case-table" aria-label={ct("Applications")}>
         <colgroup><col className="case-col-select"/><col className="case-col-traveller"/><col className="case-col-destination"/><col className="case-col-docs"/><col className="case-col-fee"/><col className="case-col-status"/><col className="case-col-action"/><col className="case-col-updated"/></colgroup>
         <thead><tr><th scope="col"><CaseSelectAll/></th><th scope="col">{copy.traveller}</th><th scope="col">{copy.destination}</th><th scope="col">{ct("Documents")}</th><th scope="col" className="case-fee">{ct("Fee")}</th><th scope="col">{ct("Status")}</th><th scope="col">{copy.action}</th><th scope="col">{ct("Last updated")}</th></tr></thead>
         <tbody>{rows.map(r=><NavigableTableRow key={r.id} href={r.base} className="case-row">
           <td><CaseSelect id={r.id} reference={r.reference}/></td><td><Link className="case-name" href={r.base}><bdi>{r.traveller}</bdi></Link><small><bdi>{r.reference}</bdi></small></td>
           <td><div className="case-destination"><CountryFlag iso={r.iso}/><div><strong>{r.country}</strong><small>{r.visa}</small></div></div></td>
           <td>{documents(r)}</td><td className="case-fee"><bdi>{r.fee}</bdi></td><td>{state(r)}</td><td>{action(r)}</td>
           <td><div className="case-updated"><span>{r.updated}</span>{quick(r)}</div></td>
         </NavigableTableRow>)}</tbody>
       </table>
     </div>
     <div className="case-mobile" data-testid="applications-cards">
       {rows.map(r=><article className="case-mobile-record" key={r.id}>
         <div><CaseSelect id={r.id} reference={r.reference}/> <Link className="case-name" href={r.base}><bdi>{r.traveller}</bdi></Link><small><bdi>{r.reference}</bdi></small></div>{state(r)}
         <div className="case-destination"><CountryFlag iso={r.iso}/><div><strong>{r.country}</strong><small>{r.visa}</small></div></div><span className="case-fee"><bdi>{r.fee}</bdi></span>
         <div><small>{ct("Documents")} · {documents(r)}</small><small>{ct("Last updated")} · {r.updated}</small><small>{r.created}</small></div><div className="case-mobile-action">{quick(r)} {r.actionText?action(r):<Link className="case-action" href={r.base}>{ct("Open dossier")} <span aria-hidden="true" className="case-arrow">→</span></Link>}</div>
       </article>)}
     </div>
     {result.pageCount>1?<Pagination locale={locale} page={result.page} pageCount={result.pageCount} total={result.total} basePath="/portal/applications" query={query}/>:null}
     {result.total>20?<div className="case-page-size"><PageSizeSelector locale={locale} pageSize={per} basePath="/portal/applications" query={query}/></div>:null}
   </>}
 </CaseSelectionProvider></CaseQuickViewProvider></div>;
}
