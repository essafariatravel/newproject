import Link from "next/link";
import { businessLabel } from "@/lib/business-labels";
import { portalPageUser } from "@/lib/page-auth";
import { activeVisaOptions, agencyDashboard } from "@/lib/queries";
import { formatAmount, formatDateTime } from "@/lib/format";
import { EmptyState } from "@/components/ui";
import { StatusBadge } from "@/components/badges";
import { getUiLocale } from "@/lib/ui-i18n";
import { contentT } from "@/lib/i18n-content";
import { countryName } from "@/lib/country-names";
import { configName } from "@/lib/config-localization";
import { hasPermission } from "@/lib/rbac";
import { DashboardCampaigns, DashboardDestination, CountryFlag, type Campaign } from "./dashboard-interactions";
import "./dashboard.css";

export const dynamic = "force-dynamic";

export default async function PortalDashboardPage() {
 const user=await portalPageUser();
 const locale=await getUiLocale();
 const ct=contentT(locale);
 const [data,options]=await Promise.all([agencyDashboard(user.agencyId,user.id),activeVisaOptions()]);
 const destinations=[...new Map(options.map(o=>[o.countryId,o])).values()].map(o=>({id:o.countryId,name:countryName({name:o.countryName,iso2:o.countryIso2},locale),iso:o.countryIso2??"",aliases:o.countryName}));
 destinations.sort((a,b)=>a.name.localeCompare(b.name,locale));
 const {totals,wallet}=data;
 const canViewTx=hasPermission(user,"transactions.view.own");
 const copy={
 fr:{updates:"À découvrir",campaigns:"Actualités ESSAFARIA",pause:"Mettre en pause",play:"Reprendre",previous:"Précédente",next:"Suivante",show:"Afficher",none:"Aucune destination disponible",noMatch:"Aucune destination trouvée",destinationSearch:"Rechercher un pays…",choose:"Choisir une destination",all:"Toutes les destinations",ready:"Vous êtes à jour",attention:"Dossiers à vérifier",active:"Suivre les dossiers",completed:"Consulter l’historique",wallet:"Voir le portefeuille",traveller:"Voyageur",destination:"Destination / visa",status:"Statut",updated:"Dernière mise à jour",activity:"Activité financière",allTx:"Toutes les transactions",quick:"Accès rapides",find:"Nom ou référence du dossier",open:"Ouvrir",required:"Action requise",campaignTitle:["Vos visas, une seule plateforme.","Suivez chaque demande.","Vos échanges, au même endroit."],campaignBody:["Retrouvez les programmes disponibles pour vos voyageurs.","Consultez l’avancement de vos dossiers à tout moment.","Retrouvez vos conversations avec ESSAFARIA."],campaignCta:["Explorer les visas","Voir mes dossiers","Ouvrir les communications"]},
 en:{updates:"Discover",campaigns:"ESSAFARIA updates",pause:"Pause",play:"Resume",previous:"Previous",next:"Next",show:"Show",none:"No destinations available",noMatch:"No matching destination",destinationSearch:"Search a country…",choose:"Choose a destination",all:"All destinations",ready:"You’re up to date",attention:"Cases to review",active:"Track applications",completed:"View history",wallet:"View wallet",traveller:"Traveller",destination:"Destination / visa",status:"Status",updated:"Last updated",activity:"Financial activity",allTx:"All transactions",quick:"Quick links",find:"Traveller name or reference",open:"Open",required:"Action required",campaignTitle:["Your visas. One platform.","Track every application.","All your conversations, together."],campaignBody:["Explore the available visa programmes for your travellers.","Check the progress of your applications at any time.","Find your conversations with ESSAFARIA."],campaignCta:["Explore visas","View applications","Open communications"]},
 ar:{updates:"اكتشف",campaigns:"مستجدات ESSAFARIA",pause:"إيقاف مؤقت",play:"استئناف",previous:"السابق",next:"التالي",show:"عرض",none:"لا توجد وجهات متاحة",noMatch:"لا توجد وجهة مطابقة",destinationSearch:"ابحث عن دولة…",choose:"اختر وجهة",all:"جميع الوجهات",ready:"لا توجد إجراءات مطلوبة",attention:"طلبات تحتاج إلى مراجعة",active:"متابعة الطلبات",completed:"عرض السجل",wallet:"عرض المحفظة",traveller:"المسافر",destination:"الوجهة / التأشيرة",status:"الحالة",updated:"آخر تحديث",activity:"النشاط المالي",allTx:"جميع المعاملات",quick:"روابط سريعة",find:"اسم المسافر أو المرجع",open:"فتح",required:"إجراء مطلوب",campaignTitle:["تأشيراتكم على منصة واحدة.","تابعوا كل طلب.","جميع مراسلاتكم في مكان واحد."],campaignBody:["استكشفوا برامج التأشيرات المتاحة لمسافريكم.","تابعوا تقدم طلباتكم في أي وقت.","اطلعوا على مراسلاتكم مع ESSAFARIA."],campaignCta:["استكشاف التأشيرات","عرض طلباتي","فتح المراسلات"]}
 }[locale];
 // Presentation-only campaign data. Future Admin source can supply this same typed shape.
 const campaigns:Campaign[]=[
  {id:"visa-services",eyebrow:copy.updates,title:copy.campaignTitle[0]!,body:copy.campaignBody[0]!,cta:copy.campaignCta[0]!,href:"/portal/applications/new",image:"/images/travel/ostuni-small.webp"},
  {id:"case-tracking",eyebrow:copy.updates,title:copy.campaignTitle[1]!,body:copy.campaignBody[1]!,cta:copy.campaignCta[1]!,href:"/portal/applications",image:"/images/travel/dulles-terminal-small.webp"},
  {id:"communications",eyebrow:copy.updates,title:copy.campaignTitle[2]!,body:copy.campaignBody[2]!,cta:copy.campaignCta[2]!,href:"/portal/communications",image:"/images/travel/cape-greco-small.webp"},
 ];
 const actionRequired=totals.actionRequired??0;
 const records=(rows:typeof data.recentApplications,attention=false)=>(
  <div className="dash-records" role="table" aria-label={ct(attention?"Needs your attention":"Recent applications")}>
   <div className="dash-record-head" role="row"><span role="columnheader">{copy.traveller}</span><span role="columnheader">{copy.destination}</span><span role="columnheader">{copy.status}</span><span role="columnheader">{copy.updated}</span></div>
   {rows.map(row=><div className="dash-record-row" role="row" key={row.app.id}>
    <span role="cell" className="dash-traveller"><Link className="dash-record-link" href={`/portal/applications/${row.app.id}${attention?"?tab=documents":""}`} aria-label={`${copy.open} ${row.app.reference} — ${row.applicantSummary}`}><bdi>{row.applicantSummary}</bdi></Link><small><bdi>{row.app.reference}</bdi></small></span>
    <span role="cell" className="dash-destination"><CountryFlag iso={row.countryIso2??""}/><span><strong>{countryName({name:row.app.countryName,iso2:row.countryIso2},locale)}</strong><small>{configName({name:row.app.visaTypeName,nameFr:row.visaNameFr,nameAr:row.visaNameAr},locale)}</small></span></span>
    <span role="cell" className="dash-state"><StatusBadge code={row.statusCode} name={row.statusName}/></span>
    <span role="cell" className="dash-updated"><span>{formatDateTime(row.app.updatedAt,locale)}</span><svg aria-hidden="true" viewBox="0 0 20 20" className="dash-chevron" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m7 5 5 5-5 5"/></svg></span>
   </div>)}
  </div>
 );
 return <div className="essafaria-dashboard" dir={locale==="ar"?"rtl":"ltr"}>
  <header className="dash-title"><h1>{ct("Agency dashboard")}</h1><p><bdi>{user.agencyName??user.name}</bdi></p></header>
  <DashboardCampaigns items={campaigns} labels={copy}/>
  {data.needsAttention.length>0?<section className="dash-section dash-attention" aria-labelledby="dash-attention"><div className="dash-section-heading"><h2 id="dash-attention">{ct("Needs your attention")}</h2><Link href="/portal/applications?documents=requested">{ct("View all")} <span aria-hidden="true" className="dash-arrow">→</span></Link></div>{records(data.needsAttention,true)}</section>:null}
  <section className="dash-command" aria-label={ct("Create application")}>
   <DashboardDestination options={destinations} locale={locale} labels={{title:ct("Create application"),choose:copy.choose,search:copy.destinationSearch,none:copy.none,noMatch:copy.noMatch,all:copy.all,continue:ct("Continue")}}/>
   <form action="/portal/applications" method="get" role="search" className="dash-find"><label htmlFor="dash-reference">{ct("Find an application")}</label><div className="dash-field-row"><div className="dash-search-wrap"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg><input id="dash-reference" name="q" type="search" dir="auto" placeholder={copy.find} className="input" maxLength={160}/></div><button className="btn-secondary" type="submit">{ct("Search")}</button></div></form>
  </section>
  <nav className="dash-metrics" aria-label={ct("Agency dashboard")}>
   <Link href="/portal/applications?queue=active" className="dash-metric"><span>{ct("Active applications")}</span><strong>{totals.active}</strong><small>{copy.active} <span aria-hidden="true" className="dash-arrow">→</span></small></Link>
   <Link href="/portal/applications?documents=requested" className="dash-metric" data-attention={actionRequired>0?"yes":"no"}><span>{copy.required}</span><strong>{actionRequired}</strong><small>{actionRequired>0?copy.attention:copy.ready} {actionRequired===0?<span aria-hidden="true">✓</span>:<span aria-hidden="true" className="dash-arrow">→</span>}</small></Link>
   <Link href="/portal/applications?queue=completed" className="dash-metric"><span>{ct("Completed")}</span><strong>{totals.completed}</strong><small>{copy.completed} <span aria-hidden="true" className="dash-arrow">→</span></small></Link>
   <Link href="/portal/wallet" className="dash-metric dash-wallet"><span>{ct("Wallet balance")}</span><strong><bdi>{formatAmount(wallet.balance,wallet.currency,locale)}</bdi></strong><small>{copy.wallet} <span aria-hidden="true" className="dash-arrow">→</span></small></Link>
  </nav>
  <div className={"dash-workspace"+(canViewTx?" has-finance":"")}>
   <section className="dash-section dash-recent" aria-labelledby="dash-recent"><div className="dash-section-heading"><h2 id="dash-recent">{ct("Recent applications")}</h2><Link href="/portal/applications">{ct("View all")} <span aria-hidden="true" className="dash-arrow">→</span></Link></div>
    {data.recentApplications.length?records(data.recentApplications):<EmptyState title={ct("No applications yet")} body={ct("Submit your first visa application to see it tracked here.")} action={<Link href="/portal/applications/new" className="btn-primary">{ct("Create application")}</Link>}/>}
   </section>
   {canViewTx?<section className="dash-section dash-finance" aria-labelledby="dash-finance"><div className="dash-section-heading"><h2 id="dash-finance">{copy.activity}</h2></div>
    <ul>{data.recentTx.length===0?<li className="dash-no-tx">{ct("No transactions yet.")}</li>:data.recentTx.slice(0,3).map(tx=>{
     const credit=Number(tx.balanceAfter)>Number(tx.balanceBefore),debit=Number(tx.balanceAfter)<Number(tx.balanceBefore);
     return <li className="dash-transaction" key={tx.id}><svg aria-hidden="true" className={credit?"dash-credit":""} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">{credit?<path d="M18 6 6 18m0-8v8h8"/>:debit?<path d="M6 18 18 6m-8 0h8v8"/>:<path d="M5 12h14"/>}</svg><div><strong>{businessLabel(tx.type,locale)}</strong><small>{formatDateTime(tx.createdAt,locale)}</small><small className="dash-tx-reference"><bdi>{tx.reference}</bdi></small></div><strong className={credit?"dash-credit":"dash-amount"}><bdi>{credit?"+":debit?"−":""}{formatAmount(tx.amount,"DZD",locale)}</bdi></strong></li>;
    })}</ul><Link className="dash-finance-link" href="/portal/wallet">{copy.allTx} <span aria-hidden="true" className="dash-arrow">→</span></Link>
   </section>:null}
  </div>
  <nav className="dash-quick-links" aria-label={copy.quick}><h2>{copy.quick}</h2><div>{[["/portal/documents","Documents","M5 3h9l5 5v13H5z M14 3v5h5"],["/portal/applicants","Applicants","M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 21v-2a8 8 0 0 1 16 0v2"],["/portal/communications","Communications","M4 4h16v12H9l-5 4z"]].map(([href,label,path])=><Link key={href} href={href!}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d={path}/></svg>{ct(label!)}<span aria-hidden="true" className="dash-arrow">→</span></Link>)}</div></nav>
 </div>;
}
