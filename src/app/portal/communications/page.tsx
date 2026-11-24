import Link from "next/link";
import { portalPageUser } from "@/lib/page-auth";
import { getUiLocale } from "@/lib/ui-i18n";
import { contentT } from "@/lib/i18n-content";
import { conversationInbox } from "@/lib/inbox";
import { listCommunications } from "@/lib/queries";
import { openConversationAction } from "@/app/actions/communications";
import { CommunicationsPanel } from "@/components/application-detail";
import { EmptyState, Flash, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/forms";
import { formatDateTime } from "@/lib/format";
import { countryName } from "@/lib/country-names";
import { flashFrom } from "@/lib/action-helpers";

export const dynamic = "force-dynamic";
export default async function PortalCommunicationsPage({ searchParams }: { searchParams: Promise<Record<string,string|undefined>> }) {
 const [user,locale,sp]=await Promise.all([portalPageUser(),getUiLocale(),searchParams]);
 const ct=contentT(locale);
 const copy={
 fr:{choose:"Sélectionnez une conversation",chooseBody:"Retrouvez les échanges et les documents de chaque dossier, sans perdre votre liste.",back:"Toutes les conversations",open:"Ouvrir le dossier et marquer les messages comme lus",reply:"Répondre",older:"Messages précédents",latest:"Derniers messages"},
 en:{choose:"Select a conversation",chooseBody:"Review each case’s messages and documents without losing your place.",back:"All conversations",open:"Open case and mark messages as read",reply:"Reply",older:"Older messages",latest:"Latest messages"},
 ar:{choose:"اختر محادثة",chooseBody:"راجع مراسلات ومستندات كل طلب دون فقدان قائمة المحادثات.",back:"جميع المحادثات",open:"فتح الملف وتحديد الرسائل كمقروءة",reply:"رد",older:"الرسائل السابقة",latest:"أحدث الرسائل"}
 }[locale];
 const page=Math.max(1,Math.min(10000,Math.trunc(typeof sp.page==="string"?Number(sp.page)||1:1)));
 const filter=typeof sp.filter==="string"&&["unread","reply"].includes(sp.filter)?sp.filter:"all";
 const q=typeof sp.q==="string"?sp.q.slice(0,160):"";
 const threads=await conversationInbox(user,{q,filter,page});
 // A requested thread must be in the authenticated agency's own scoped result.
 const selected=threads.find(t=>t.applicationId===sp.thread);
 const messages=selected?await listCommunications(selected.applicationId,user,sp.messagesBefore):[];
 const url=(thread?:string,nextPage=page)=>{
  const params=new URLSearchParams();
  if(q)params.set("q",q);if(filter!=="all")params.set("filter",filter);
  if(nextPage>1)params.set("page",String(nextPage));
  if(thread)params.set("thread",thread);
  return "/portal/communications"+(params.size?"?"+params.toString():"");
 };
 return <>
 <PageHeader title={ct("Communications")} subtitle={ct("Conversations attached to your travellers' dossiers.")}/>
 <Flash {...flashFrom(sp)}/>
 <div className={"agency-v2-mail "+(selected?"has-thread":"")}>
  <section className="agency-v2-mail-list" aria-label={copy.back}>
   <form method="get" className="agency-v2-mail-search" role="search">
    <label htmlFor="inbox-search" className="sr-only">{ct("Search")}</label>
    <input id="inbox-search" name="q" type="search" className="input" defaultValue={q} placeholder={ct("Traveller, agency or reference")} maxLength={160}/>
    <button className="btn-secondary">{ct("Search")}</button>
    {filter!=="all"?<input type="hidden" name="filter" value={filter}/>:null}
   </form>
   <nav className="agency-v2-mail-filters" aria-label={ct("Filter")}>{[["all","All"],["unread","Unread"],["reply","Needs reply"]].map(([value,label])=>{
    const params=new URLSearchParams();if(q)params.set("q",q);if(value!=="all")params.set("filter",value!);
    return <Link key={value} href={"/portal/communications"+(params.size?"?"+params.toString():"")} aria-current={filter===value?"page":undefined}>{ct(label!)}</Link>;
   })}</nav>
   {threads.length?<ol className="agency-v2-mail-threads">{threads.map(thread=><li key={thread.applicationId}><Link className="agency-v2-mail-row" href={url(thread.applicationId)} aria-current={selected?.applicationId===thread.applicationId?"page":undefined}>
    <span className="agency-v2-mail-row-top"><strong><bdi>{thread.traveller||thread.reference}</bdi></strong>{thread.unread?<span className="agency-v2-unread" aria-label={ct("Unread")} title={ct("Unread")}/>:null}</span>
    <span className="agency-v2-mail-destination"><bdi>{countryName({name:thread.destination},locale)} · {thread.reference}</bdi></span>
    <span className="agency-v2-mail-preview"><bdi>{thread.body}</bdi></span>
    <span className="agency-v2-mail-meta"><time dateTime={thread.createdAt.toISOString()}>{formatDateTime(thread.createdAt,locale)}</time>{thread.needsReply?<span>{ct("Needs reply")}</span>:null}</span>
   </Link></li>)}</ol>:<EmptyState title={ct("No messages yet")} body={ct("Messages remain attached to each dossier.")}/>}
   {page>1||threads.length===100?<nav className="agency-v2-mail-pages" aria-label={ct("Communications")}>{page>1?<Link className="btn-secondary" href={url(undefined,page-1)}>{ct("Previous")}</Link>:null}{threads.length===100?<Link className="btn-secondary" href={url(undefined,page+1)}>{ct("Next")}</Link>:null}</nav>:null}
  </section>
  <section className="agency-v2-mail-detail" aria-label={ct("Messages")}>
   {selected?<><header className="agency-v2-mail-header">
    <Link href={url()} className="agency-v2-mail-back btn-secondary"><span aria-hidden="true" className="directional">←</span> {copy.back}</Link>
    <h2><bdi>{selected.traveller||selected.reference}</bdi></h2>
    <p><bdi>{countryName({name:selected.destination},locale)} · {selected.reference}</bdi></p>
    <form action={openConversationAction}><input type="hidden" name="applicationId" value={selected.applicationId}/><SubmitButton className="btn-secondary" pendingLabel={ct("Posting…")}>{copy.open}</SubmitButton></form>
   </header><div className="agency-v2-mail-body"><CommunicationsPanel applicationId={selected.applicationId} messages={messages} user={user} back={url(selected.applicationId)} locale={locale}/></div></>:<div className="agency-v2-mail-empty"><h2>{copy.choose}</h2><p>{copy.chooseBody}</p></div>}
  </section>
 </div>
 </>;
}
