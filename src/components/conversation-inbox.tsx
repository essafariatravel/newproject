import { conversationInbox } from "@/lib/inbox";
import { contentT } from "@/lib/i18n-content";
import { formatDateTime } from "@/lib/format";
import { openConversationAction } from "@/app/actions/communications";
import { EmptyState,PageHeader } from "@/components/ui";
import type { AuthUser } from "@/lib/types";
import type { UiLocale } from "@/lib/ui-i18n";
export async function ConversationInbox({user,locale,sp}:{user:AuthUser;locale:UiLocale;sp:Record<string,string|undefined>}){
  const ct=contentT(locale),threads=await conversationInbox(user,{q:sp.q,filter:sp.filter,page:Number(sp.page)||1});
  return <><PageHeader title={ct("Communications")} subtitle={ct("Conversations attached to your travellers' dossiers.")}/>
    <form method="get" className="inbox-filters"><label htmlFor="inbox-search" className="sr-only">{ct("Search")}</label><input id="inbox-search" className="input" name="q" defaultValue={sp.q} placeholder={ct("Traveller, agency or reference")}/><label htmlFor="inbox-filter" className="sr-only">{ct("Filter")}</label><select id="inbox-filter" name="filter" className="input" defaultValue={sp.filter??"all"}><option value="all">{ct("All")}</option><option value="unread">{ct("Unread")}</option><option value="reply">{ct("Needs reply")}</option></select><button className="btn-secondary">{ct("Search")}</button></form>
    {threads.length ? <ol className="conversation-inbox">{threads.map(thread=><li key={thread.applicationId}>
      <form action={openConversationAction}><input type="hidden" name="applicationId" value={thread.applicationId}/><button className="conversation-thread" type="submit">
      <span className="conversation-heading"><strong>{thread.traveller || thread.reference}</strong><small>{!user.agencyId?`${thread.agencyName} · `:""}{thread.destination} · {thread.visa}</small></span>
      <span className="conversation-preview">{thread.body}<small><bdi>{thread.reference}</bdi> · {formatDateTime(thread.createdAt,locale)}</small></span>
      <span className="conversation-state">{thread.unread?<strong>{ct("Unread")}</strong>:null}{thread.needsReply?<span>{ct("Needs reply")}</span>:null}{!user.agencyId&&thread.visibility==="INTERNAL"?<small>{ct("Internal note")}</small>:null}<span className="directional-arrow" aria-hidden="true">→</span></span>
      </button></form></li>)}</ol>:<EmptyState title={ct("No messages yet")} body={ct("Messages remain attached to each dossier.")}/>}
    {threads.length===100?<a className="btn-secondary mt-4" href={`?q=${encodeURIComponent(sp.q??"")}&filter=${sp.filter??"all"}&page=${(Number(sp.page)||1)+1}`}>{ct("Next")}</a>:null}
  </>;
}
