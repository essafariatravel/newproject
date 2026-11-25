"use client";
import {useEffect,useRef,useTransition} from "react";
import {useRouter} from "next/navigation";
type Locale="fr"|"en"|"ar";
export function CaseConversationMotion({locale,latest,older}:{locale:Locale;latest:string;older:boolean}){
 const router=useRouter(),root=useRef<HTMLButtonElement>(null),initial=useRef(true),lastRefresh=useRef(0),[pending,startTransition]=useTransition();
 const label=({fr:"Actualiser la conversation",en:"Refresh conversation",ar:"تحديث المحادثة"}[locale]);
 useEffect(()=>{if(older)return;const thread=root.current?.closest(".dossier-messages")?.querySelector<HTMLElement>(".adaptive-thread");if(!thread)return;
 const nearBottom=thread.scrollHeight-thread.scrollTop-thread.clientHeight<160;if(initial.current||nearBottom){thread.scrollTop=thread.scrollHeight;initial.current=false}},[latest,older]);
 useEffect(()=>{if(older)return;lastRefresh.current=Date.now();const refresh=()=>{if(document.visibilityState!=="visible"||Date.now()-lastRefresh.current<30000)return;lastRefresh.current=Date.now();router.refresh()};window.addEventListener("focus",refresh);document.addEventListener("visibilitychange",refresh);return()=>{window.removeEventListener("focus",refresh);document.removeEventListener("visibilitychange",refresh)}},[router,older]);
 return <button ref={root} className="adaptive-chat-refresh" type="button" aria-label={label} title={label} disabled={pending} onClick={()=>{lastRefresh.current=Date.now();startTransition(()=>router.refresh())}}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2 6M20 4v7h-7"/></svg></button>
}
