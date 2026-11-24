import Link from "next/link";
import { and, count, eq, isNotNull, max } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications } from "@/db/schema";
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
 const [data,options,usage]=await Promise.all([
  agencyDashboard(user.agencyId,user.id),activeVisaOptions(),
  // Read only, authenticated tenant scope; count actual submissions, not drafts or clicks.
  db.select({countryId:applications.countryId,total:count(),lastUsed:max(applications.submittedAt)})
    .from(applications).where(and(eq(applications.agencyId,user.agencyId),isNotNull(applications.submittedAt)))
    .groupBy(applications.countryId).catch(()=>{console.warn("Dashboard destination ranking unavailable");return [];})
 ]);
 const regionAliases=new Map<string,string[]>();
 const commonAliases:Record<string,string[]>={AE:["Dubai","Dubaï","Abu Dhabi","UAE","EAU","دبي","أبو ظبي"],TR:["Turkey","Türkiye","Turkiye"],GB:["UK","United Kingdom","Royaume-Uni","Grande-Bretagne"],US:["USA","États-Unis","United States"],CN:["China","PRC"],KR:["South Korea","Corée du Sud"]};
 const destinations=[...new Map(options.map(o=>[o.countryId,o])).values()].map(o=>{
  const iso=(o.countryIso2??"").toUpperCase();
  if(!regionAliases.has(iso))regionAliases.set(iso,/^[A-Z]{2}$/.test(iso)?(["fr","en","ar"] as const).map(lang=>countryName({name:o.countryName,iso2:iso},lang)).concat(commonAliases[iso]??[]):[]);
  return {id:o.countryId,name:countryName({name:o.countryName,iso2:iso},locale),iso,aliases:[o.countryName,...(regionAliases.get(iso)??[])]};
 });
 destinations.sort((a,b)=>a.name.localeCompare(b.name,locale));
 const usageByCountry=new Map(usage.map(row=>[row.countryId,row]));
 const lastUsed=(id:string)=>{const value=usageByCountry.get(id)?.lastUsed;return value?new Date(value).getTime()||0:0;};
 const shortcutIds=[...destinations].sort((a,b)=>(usageByCountry.get(b.id)?.total??0)-(usageByCountry.get(a.id)?.total??0)||lastUsed(b.id)-lastUsed(a.id)||a.name.localeCompare(b.name,locale)).slice(0,4).map(o=>o.id);
 const {totals,wallet}=data;
 const canTopup=hasPermission(user,"transactions.view.own") && user.role==="AGENCY_ADMIN";
 const moreLabel={fr:"Plus",en:"More",ar:"المزيد"}[locale];
 const shortcuts={fr:"Destinations suggérées",en:"Suggested destinations",ar:"الوجهات المقترحة"}[locale];
 const heading={fr:"Tableau de bord",en:"Dashboard",ar:"لوحة التحكم"}[locale];
 const opening={fr:"Ouverture de la demande…",en:"Opening application…",ar:"جارٍ فتح الطلب…"}[locale];
 const topup={fr:"Recharger",en:"Top up",ar:"شحن المحفظة"}[locale];
 const formattedBalance=formatAmount(wallet.balance,wallet.currency,locale);
 const searchLabel={fr:"Où se rend votre voyageur ?",en:"Where is your traveller going?",ar:"ما وجهة مسافركم؟"}[locale];
 const copy={
 fr:{updates:"À découvrir",campaigns:"Actualités ESSAFARIA",pause:"Mettre en pause",play:"Reprendre",previous:"Précédente",next:"Suivante",show:"Afficher",none:"Aucune destination disponible",noMatch:"Aucune destination trouvée",destinationSearch:"Rechercher un pays…",choose:"Choisir une destination",all:"Toutes les destinations",ready:"Vous êtes à jour",attention:"Dossiers à vérifier",active:"Consulter",wallet:"Portefeuille",traveller:"Voyageur",destination:"Destination / visa",status:"Statut",updated:"Dernière mise à jour",find:"Nom ou référence du dossier",open:"Ouvrir",required:"Action requise",campaignTitle:["Vos visas, une seule plateforme.","Suivez chaque demande.","Vos échanges, au même endroit."],campaignBody:["Retrouvez les programmes disponibles pour vos voyageurs.","Consultez l’avancement de vos dossiers à tout moment.","Retrouvez vos conversations avec ESSAFARIA."],campaignCta:["Explorer les visas","Voir mes dossiers","Ouvrir les communications"]},
 en:{updates:"Discover",campaigns:"ESSAFARIA updates",pause:"Pause",play:"Resume",previous:"Previous",next:"Next",show:"Show",none:"No destinations available",noMatch:"No matching destination",destinationSearch:"Search a country…",choose:"Choose a destination",all:"All destinations",ready:"You’re up to date",attention:"Cases to review",active:"View",wallet:"Wallet",traveller:"Traveller",destination:"Destination / visa",status:"Status",updated:"Last updated",find:"Traveller name or reference",open:"Open",required:"Action required",campaignTitle:["Your visas. One platform.","Track every application.","All your conversations, together."],campaignBody:["Explore the available visa programmes for your travellers.","Check the progress of your applications at any time.","Find your conversations with ESSAFARIA."],campaignCta:["Explore visas","View applications","Open communications"]},
 ar:{updates:"اكتشف",campaigns:"مستجدات ESSAFARIA",pause:"إيقاف مؤقت",play:"استئناف",previous:"السابق",next:"التالي",show:"عرض",none:"لا توجد وجهات متاحة",noMatch:"لا توجد وجهة مطابقة",destinationSearch:"ابحث عن دولة…",choose:"اختر وجهة",all:"جميع الوجهات",ready:"لا توجد إجراءات مطلوبة",attention:"طلبات تحتاج إلى مراجعة",active:"عرض الطلبات",wallet:"المحفظة",traveller:"المسافر",destination:"الوجهة / التأشيرة",status:"الحالة",updated:"آخر تحديث",find:"اسم المسافر أو المرجع",open:"فتح",required:"إجراء مطلوب",campaignTitle:["تأشيراتكم على منصة واحدة.","تابعوا كل طلب.","جميع مراسلاتكم في مكان واحد."],campaignBody:["استكشفوا برامج التأشيرات المتاحة لمسافريكم.","تابعوا تقدم طلباتكم في أي وقت.","اطلعوا على مراسلاتكم مع ESSAFARIA."],campaignCta:["استكشاف التأشيرات","عرض طلباتي","فتح المراسلات"]}
 }[locale];
 // Presentation-only campaign data. Future Admin source can supply this same typed shape.
 const editorial={
 fr:[{title:"Préparez le prochain départ.",body:"Les programmes de visa disponibles pour vos voyageurs.",cta:"Voir les destinations"},{title:"Suivez vos demandes.",body:"L’avancement de vos dossiers, à tout moment.",cta:"Voir mes dossiers"}],
 en:[{title:"Prepare the next departure.",body:"Available visa programmes for your travellers.",cta:"Browse destinations"},{title:"Track your applications.",body:"Check the progress of your cases at any time.",cta:"View applications"}],
 ar:[{title:"استعدوا للرحلة القادمة.",body:"برامج التأشيرات المتاحة لمسافريكم.",cta:"عرض الوجهات"},{title:"تابعوا طلباتكم.",body:"اطلعوا على تقدم ملفاتكم في أي وقت.",cta:"عرض الطلبات"}]
 }[locale];
 const campaigns:Campaign[]=[
  {id:"visa-services",...editorial[0]!,href:"/portal/applications/new",image:"/images/travel/ostuni.webp",smallImage:"/images/travel/ostuni-small.webp"},
  {id:"case-tracking",...editorial[1]!,href:"/portal/applications",image:"/images/travel/dulles-terminal.webp",smallImage:"/images/travel/dulles-terminal-small.webp"},
 ];
 const actionRequired=totals.actionRequired??0;
 const records=(rows:typeof data.recentApplications,attention=false)=>(
  <div className="dash-records" role="table" aria-label={ct(attention?"Needs your attention":"Recent applications")}>
   <div className="dash-record-head" role="row"><span role="columnheader">{copy.traveller}</span><span role="columnheader">{copy.destination}</span><span role="columnheader">{copy.status}</span><span role="columnheader">{copy.updated}</span></div>
   {rows.map(row=><div className="dash-record-row" role="row" key={row.app.id}>
    <span role="cell" className="dash-traveller"><Link className="dash-record-link" href={`/portal/applications/${row.app.id}${attention?"?tab=documents":""}`} aria-label={`${copy.open} ${row.app.reference} — ${row.applicantSummary}`}><bdi>{row.applicantSummary}</bdi></Link><small><bdi>{row.app.reference}</bdi></small></span>
    <span role="cell" className="dash-destination"><CountryFlag iso={row.countryIso2??""}/><span><strong>{countryName({name:row.app.countryName,iso2:row.countryIso2},locale)}</strong><small>{configName({name:row.app.visaTypeName,nameFr:row.visaNameFr,nameAr:row.visaNameAr},locale)}</small></span></span>
    <span role="cell" className="dash-state" data-status={row.statusCode}><StatusBadge code={row.statusCode} name={row.statusName}/></span>
    <span role="cell" className="dash-updated"><span>{formatDateTime(row.app.updatedAt,locale)}</span><svg aria-hidden="true" viewBox="0 0 20 20" className="dash-chevron" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m7 5 5 5-5 5"/></svg></span>
   </div>)}
  </div>
 );
 return <div className="essafaria-dashboard" dir={locale==="ar"?"rtl":"ltr"}>
  <header className="dash-title"><h1>{heading}</h1><p><bdi>{user.agencyName??user.name}</bdi></p></header>
  <DashboardCampaigns items={campaigns} labels={copy}/>
  {data.needsAttention.length>0?<section className="dash-section dash-attention" aria-labelledby="dash-attention"><div className="dash-section-heading"><h2 id="dash-attention">{ct("Needs your attention")}</h2><Link href="/portal/applications?documents=requested">{ct("View all")} <span aria-hidden="true" className="dash-arrow">→</span></Link></div>{records(data.needsAttention,true)}</section>:null}
  <section className="dash-command" aria-label={ct("Create application")}>
   <DashboardDestination options={destinations} shortcutIds={shortcutIds} locale={locale} labels={{title:searchLabel,choose:copy.choose,search:copy.destinationSearch,none:copy.none,noMatch:copy.noMatch,all:copy.all,shortcuts,opening}}/>
   <form action="/portal/applications" method="get" role="search" className="dash-find"><label htmlFor="dash-reference">{ct("Find an application")}</label><div className="dash-field-row"><div className="dash-search-wrap"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg><input id="dash-reference" name="q" type="search" dir="auto" placeholder={copy.find} className="input" maxLength={160}/></div><button className="btn-secondary" type="submit">{ct("Search")}</button></div></form>
  </section>
  <nav className="dash-metrics" aria-label={ct("Agency dashboard")}>
   <Link href="/portal/applications?queue=active" className="dash-metric"><span>{ct("Active applications")}</span><strong>{totals.active}</strong><small>{copy.active}</small></Link>
   <Link href="/portal/applications?documents=requested" className="dash-metric" data-attention={actionRequired>0?"yes":"no"}><span>{copy.required}</span><strong>{actionRequired}</strong><small>{actionRequired>0?copy.attention:copy.ready} {actionRequired===0?<span aria-hidden="true">✓</span>:null}</small></Link>
   <div className="dash-metric dash-wallet"><span>{{fr:"Solde disponible",en:"Available balance",ar:"الرصيد المتاح"}[locale]}</span><strong><bdi className="dash-wallet-number">{formattedBalance.replace(/ DZD$/,"")}{formattedBalance.endsWith(" DZD")?<span className="dash-currency">DZD</span>:null}</bdi></strong><div className="dash-wallet-actions"><Link href="/portal/wallet">{copy.wallet}</Link>{canTopup?<Link href="/portal/wallet#topup" className="dash-topup"><span aria-hidden="true">+</span> {topup}</Link>:null}</div></div>
  </nav>
  <div className="dash-workspace">
   <section className="dash-section dash-recent" aria-labelledby="dash-recent"><div className="dash-section-heading"><h2 id="dash-recent">{ct("Recent applications")}</h2><div className="dash-recent-actions"><Link href="/portal/applications">{ct("View all")} <span aria-hidden="true" className="dash-arrow">→</span></Link><details className="dash-more"><summary>{moreLabel}<svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m5 8 5 5 5-5"/></svg></summary><div className="dash-more-panel"><Link href="/portal/documents">{ct("Documents")}</Link><Link href="/portal/applicants">{ct("Applicants")}</Link></div></details></div></div>
    {data.recentApplications.length?records(data.recentApplications.slice(0,3)):<EmptyState title={ct("No applications yet")} body={ct("Submit your first visa application to see it tracked here.")} action={<Link href="/portal/applications/new" className="btn-primary">{ct("Create application")}</Link>}/>}
   </section>
  </div>
 </div>;
}
