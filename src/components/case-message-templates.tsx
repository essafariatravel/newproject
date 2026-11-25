"use client";
import {useEffect,useId,useRef,useState} from "react";
import {SubmitButton} from "./forms";
import {postMessageAction} from "@/app/actions/communications";
type Locale="fr"|"en"|"ar";
const copy={
 fr:{title:"Nouveau message",templates:"Modèles de message",placeholder:"Écrire un message…",send:"Envoyer",pending:"Envoi…",private:"Visible uniquement par votre agence et l’équipe ESSAFARIA.",items:[{label:"Suivi du dossier",body:"Bonjour, pourriez-vous nous communiquer l’état d’avancement de ce dossier ? Merci."},{label:"Documents complémentaires",body:"Bonjour, nous souhaitons vérifier si des documents complémentaires sont nécessaires. Merci."}]},
 en:{title:"New message",templates:"Message templates",placeholder:"Write a message…",send:"Send",pending:"Sending…",private:"Visible only to your agency and the ESSAFARIA team.",items:[{label:"Case update",body:"Hello, could you please provide an update on this case? Thank you."},{label:"Additional documents",body:"Hello, could you confirm whether additional documents are needed? Thank you."}]},
 ar:{title:"رسالة جديدة",templates:"نماذج الرسائل",placeholder:"اكتب رسالة…",send:"إرسال",pending:"جارٍ الإرسال…",private:"مرئية لوكالتكم وفريق ESSAFARIA فقط.",items:[{label:"متابعة الطلب",body:"مرحبًا، هل يمكنكم إبلاغنا بمستجدات هذا الطلب؟ شكرًا."},{label:"وثائق إضافية",body:"مرحبًا، هل يمكنكم تأكيد ما إذا كانت هناك وثائق إضافية مطلوبة؟ شكرًا."}]}
};
export function CaseMessageComposer({locale,applicationId,back,requestTitle,terminal}:{locale:Locale;applicationId:string;back:string;requestTitle?:string;terminal?:boolean}){
 const t=copy[locale],id=useId(),input=useRef<HTMLTextAreaElement>(null),[body,setBody]=useState("");
 const context=requestTitle?({fr:{label:"Question sur le document",body:"Bonjour, pourriez-vous nous préciser les conditions relatives à la pièce demandée (« "+requestTitle+" ») ? Merci."},en:{label:"Ask about this document",body:"Hello, could you clarify the requirements for "+requestTitle+"? Thank you."},ar:{label:"استفسار عن الوثيقة",body:"مرحبًا، هل يمكنكم توضيح شروط الوثيقة المطلوبة ("+requestTitle+")؟ شكرًا."}}[locale]):null;
 const decision={fr:{label:"Question sur la décision",body:"Bonjour, nous souhaitons obtenir une précision concernant la décision de ce dossier. Merci."},en:{label:"Ask about the decision",body:"Hello, we would like clarification about the decision on this case. Thank you."},ar:{label:"استفسار عن القرار",body:"مرحبًا، نود الحصول على توضيح بشأن قرار هذا الطلب. شكرًا."}}[locale];
 const items=terminal?[decision]:context?[context,...t.items.slice(0,1)]:t.items;
 useEffect(()=>{const el=input.current;if(!el)return;el.style.height="auto";el.style.height=Math.min(el.scrollHeight,180)+"px"},[body]);
 const append=(text:string)=>{setBody(previous=>{const joined=previous.trim()?previous+"\n"+text:text;return joined.length<=4000?joined:previous});input.current?.focus()};
 return <form action={postMessageAction} className="card dossier-message-composer">
  <input type="hidden" name="applicationId" value={applicationId}/><input type="hidden" name="back" value={back}/>
  <label htmlFor={id} className="sr-only">{t.title}</label>
  <div className="case-message-templates" role="group" aria-label={t.templates}>{items.map(item=><button key={item.label} type="button" className="btn-secondary btn-sm dossier-template-button" disabled={body.length+item.body.length+(body.trim()?1:0)>4000} onClick={()=>append(item.body)}>{item.label}</button>)}</div>
  <textarea ref={input} id={id} name="body" className="input dossier-message-input" dir="auto" value={body} onChange={e=>setBody(e.target.value)} rows={2} required minLength={2} maxLength={4000} placeholder={t.placeholder}/>
  <div className="dossier-compose-footer"><p className="dossier-message-privacy"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>{t.private}</p>{body.length>3600?<span className="dossier-message-count"><bdi>{body.length}/4000</bdi></span>:null}<SubmitButton className="btn-primary btn-sm dossier-send" pendingLabel={t.pending} disabled={body.trim().length<2}>{t.send}<svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="directional"><path d="m3 3 18 9-18 9 4-9-4-9Zm4 9h14"/></svg></SubmitButton></div>
 </form>
}
