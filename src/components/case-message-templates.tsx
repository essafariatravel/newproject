"use client";
import {useState} from "react";
export function CaseMessageTemplates({locale,inputId}:{locale:"fr"|"en"|"ar";inputId:string}){
 const [choice,setChoice]=useState("");
 const t={fr:{label:"Modèles de message",items:["Bonjour, pourriez-vous nous communiquer l’état d’avancement de ce dossier ? Merci.","Bonjour, nous souhaitons vérifier si des documents complémentaires sont nécessaires. Merci."]},en:{label:"Message templates",items:["Hello, could you please provide an update on this case? Thank you.","Hello, could you confirm whether additional documents are needed? Thank you."]},ar:{label:"نماذج الرسائل",items:["مرحبًا، هل يمكنكم إبلاغنا بمستجدات هذا الطلب؟ شكرًا.","مرحبًا، هل يمكنكم تأكيد ما إذا كانت هناك وثائق إضافية مطلوبة؟ شكرًا."]}}[locale];
 return <div className="case-message-templates"><select aria-label={t.label} value={choice} onChange={e=>{const v=e.target.value;setChoice(v);const el=document.getElementById(inputId);if(v&&el instanceof HTMLTextAreaElement){el.value=el.value?el.value+"\n"+v:v;el.focus()}setChoice("")}}><option value="">{t.label}</option>{t.items.map(x=><option key={x} value={x}>{x}</option>)}</select></div>
}
