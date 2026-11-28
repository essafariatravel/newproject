import Link from "next/link";
import {notFound} from "next/navigation";
import {portalPageUser} from "@/lib/page-auth";
import {getUiLocale} from "@/lib/ui-i18n";
import {canAccessGroups} from "@/lib/group-access";
import {pool} from "@/lib/db";
import {qualifiedTable as qt} from "@/lib/database-schema";
import {groupEnabled,groupProgress,groupTrackingFilter,groupTrackingPage,groupReuseReady} from "@/lib/group-policy";
import {groupCopy} from "@/lib/group-copy";
import {formatDate} from "@/lib/format";
import {businessLabel} from "@/lib/business-labels";
export const dynamic="force-dynamic";
const PAGE_SIZE=12;
const copy={
 fr:{all:"Tous",attention:"Action requise",active:"En cours",closed:"Terminés",search:"Nom, référence ou destination",apply:"Rechercher",reset:"Effacer",closedCount:"dossiers terminés",activeCount:"en cours",actionCount:"à compléter",reuse:"Repréparer ce groupe",incomplete:"Liste à vérifier",documents:"Compléter les documents",previous:"Précédent",next:"Suivant",empty:"Aucun groupe correspondant",retry:"Réessayer"},
 en:{all:"All",attention:"Action required",active:"In progress",closed:"Closed",search:"Name, reference or destination",apply:"Search",reset:"Clear",closedCount:"closed cases",activeCount:"in progress",actionCount:"need attention",reuse:"Prepare this group again",incomplete:"Roster needs review",documents:"Complete documents",previous:"Previous",next:"Next",empty:"No matching groups",retry:"Retry"},
 ar:{all:"الكل",attention:"إجراء مطلوب",active:"قيد المعالجة",closed:"مغلقة",search:"الاسم أو المرجع أو الوجهة",apply:"بحث",reset:"مسح",closedCount:"طلبات مغلقة",activeCount:"قيد المعالجة",actionCount:"تحتاج إلى استكمال",reuse:"إعداد المجموعة مجدداً",incomplete:"القائمة تحتاج إلى مراجعة",documents:"استكمال الوثائق",previous:"السابق",next:"التالي",empty:"لا توجد مجموعات مطابقة",retry:"إعادة المحاولة"}
} as const;
type Row={group_id:string;created_at:Date;member_count:number;position:number;id:string;reference:string;name:string;country_name:string;status:string;terminal:boolean;attention:boolean;profile_id:string|null};
export default async function GroupsPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 if(!groupEnabled())notFound();const user=await portalPageUser();if(!canAccessGroups(user))notFound();
 const sp=await searchParams,locale=await getUiLocale(),t=groupCopy[locale],c=copy[locale],q=typeof sp.q==="string"?sp.q.trim().slice(0,100):"",filter=groupTrackingFilter(sp.filter),page=groupTrackingPage(sp.page);
 const url=(nextPage=1,nextFilter=filter)=>{const p=new URLSearchParams();if(q)p.set("q",q);if(nextFilter!=="all")p.set("filter",nextFilter);if(nextPage>1)p.set("page",String(nextPage));return "/portal/applications/groups"+(p.size?"?"+p:"")};
 const r=await pool.query<Row>(`with scoped as (
 select g.id group_id,g.created_at,g.member_count,m.position,a.id,a.reference,coalesce(t.full_name,'') name,a.country_name,s.code status,(s.is_terminal or s.code in ('APPROVED','COMPLETED','CANCELLED','REJECTED','REFUSED')) terminal,
 exists(select 1 from ${qt("document_requests")} d where d.application_id=a.id and d.status='OPEN') attention,l.profile_id
 from ${qt("visa_request_groups")} g join ${qt("visa_request_group_members")} m on m.group_id=g.id and m.agency_id=g.agency_id join ${qt("applications")} a on a.id=m.application_id and a.agency_id=m.agency_id join ${qt("statuses")} s on s.id=a.status_id left join ${qt("applicants")} t on t.application_id=a.id left join ${qt("traveller_profile_links")} l on l.applicant_id=t.id and l.agency_id=g.agency_id where g.agency_id=$1
 ), selected as (select group_id,max(created_at) created_at from scoped group by group_id having
 ($2='' or bool_or(position(lower($2) in lower(concat_ws(' ',name,reference,country_name)))>0)) and
 ($3='all' or ($3='attention' and bool_or(not terminal and attention)) or ($3='active' and bool_or(not terminal)) or ($3='closed' and bool_and(terminal)))
 order by max(created_at) desc,group_id desc limit $4 offset $5)
 select s.* from scoped s join selected x on x.group_id=s.group_id order by x.created_at desc,s.group_id desc,s.position`,[user.agencyId,q,filter,PAGE_SIZE+1,(page-1)*PAGE_SIZE]);
 const groups=new Map<string,Row[]>();for(const row of r.rows)groups.set(row.group_id,[...(groups.get(row.group_id)??[]),row]);const entries=[...groups.entries()],hasNext=entries.length>PAGE_SIZE;
 return <section className="group-wizard group-history" dir={locale==="ar"?"rtl":"ltr"}><header className="group-heading"><h1>{t.history}</h1><Link className="btn-primary" href="/portal/applications/new?mode=group">{t.group} →</Link></header>
 <form className="group-history-search" action="/portal/applications/groups" method="get"><input type="search" name="q" className="input" defaultValue={q} maxLength={100} placeholder={c.search} aria-label={c.search}/>{filter!=="all"?<input type="hidden" name="filter" value={filter}/>:null}<button className="btn-secondary" type="submit">{c.apply}</button>{q?<Link className="booking-link" href="/portal/applications/groups">{c.reset}</Link>:null}</form>
 <nav className="group-history-tabs" aria-label={t.status}>{(["all","attention","active","closed"] as const).map(k=><Link key={k} href={url(1,k)} aria-current={filter===k?"page":undefined}>{c[k]}</Link>)}</nav>
 {!entries.length?<p>{c.empty}</p>:entries.slice(0,PAGE_SIZE).map(([id,rows])=>{const first=rows[0]!,p=groupProgress(rows,first.member_count),reuse=p.consistent&&groupReuseReady(rows.map(m=>m.profile_id),first.member_count);return <section key={id} className="group-list group-history-entry"><div className="group-heading"><div><h2>{first.country_name} · <bdi>{first.member_count}</bdi> {t.travellers}</h2><small>{formatDate(first.created_at,locale)}</small></div>{reuse?<Link className="booking-link" href={"/portal/applications/new?mode=group&repeatGroup="+encodeURIComponent(id)}>{c.reuse} →</Link>:null}</div><div className="group-history-progress"><span><bdi>{p.closed}/{first.member_count}</bdi> {c.closedCount}</span><span><bdi>{p.active}</bdi> {c.activeCount}</span>{p.action?<Link href={"/portal/applications/"+encodeURIComponent(rows.find(m=>m.attention&&!m.terminal)!.id)+"?tab=documents"} className="booking-link"><bdi>{p.action}</bdi> {c.actionCount} →</Link>:null}</div>{p.consistent?<progress aria-label={c.closedCount} value={p.closed} max={first.member_count}/>:<p role="status" className="booking-warning">{c.incomplete}</p>}{rows.map(m=><div className="group-review-row" key={m.id}><div><strong><bdi>{m.name}</bdi></strong><small><bdi>{m.reference}</bdi> · {businessLabel(m.status,locale)}</small></div><Link className="booking-link" href={"/portal/applications/"+encodeURIComponent(m.id)+(m.attention&&!m.terminal?"?tab=documents":"")}>{m.attention&&!m.terminal?c.documents:t.open} →</Link></div>)}</section>})}
 {page>1||hasNext?<nav className="group-heading" aria-label={t.history}>{page>1?<Link className="btn-secondary" href={url(page-1)}>{c.previous}</Link>:<span/>}<bdi>{page}</bdi>{hasNext?<Link className="btn-secondary" href={url(page+1)}>{c.next}</Link>:<span/>}</nav>:null}</section>
}
