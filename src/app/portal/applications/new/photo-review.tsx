"use client";
import {useState} from "react";
import {photoRatioDifference,type ImageSignals} from "@/lib/document-intelligence";
type Locale="fr"|"en"|"ar";
const copy={
 fr:{title:"Référence de cadrage",choose:"Choisissez le format demandé par le consulat",none:"Aucune référence",diff:"Écart de proportions",manual:"Vérification visuelle personnelle",checks:["Visage de face et bien visible","Fond conforme aux exigences du consulat","Cadrage et expression vérifiés","Aucune retouche du visage"],note:"Les proportions sont indicatives. La résolution en pixels ne permet pas de certifier la taille imprimée. Cette checklist ne constitue pas une validation biométrique.",alt:"Photo originale à vérifier"},
 en:{title:"Framing reference",choose:"Choose the format requested by the consulate",none:"No reference",diff:"Aspect ratio difference",manual:"Personal visual review",checks:["Face straight and clearly visible","Background meets consular requirements","Framing and expression checked","Face has not been retouched"],note:"Aspect ratios are indicative. Pixel resolution cannot certify physical print size. This checklist is not biometric validation.",alt:"Original photo for review"},
 ar:{title:"مرجع التأطير",choose:"اختاروا المقاس المطلوب من القنصلية",none:"بدون مرجع",diff:"فرق النسب",manual:"مراجعة بصرية شخصية",checks:["الوجه أمامي وواضح","الخلفية مطابقة لمتطلبات القنصلية","تم التحقق من التأطير والتعبير","لم يتم تنقيح الوجه"],note:"النسب إرشادية. دقة البكسل لا تثبت حجم الطباعة. هذه القائمة ليست تحققاً بيومترياً.",alt:"الصورة الأصلية للمراجعة"}
} as const;
export function PhotoReview({locale,signals,src}:{locale:Locale;signals:ImageSignals;src:string}){
 const t=copy[locale];const [format,setFormat]=useState(""),[checks,setChecks]=useState<boolean[]>([false,false,false,false]);
 const [w,h]=format.split(":").map(Number),difference=photoRatioDifference(signals.width,signals.height,w!,h!);
 return <section className="di-photo-review"><strong>{t.title}</strong><label className="di-field">{t.choose}<select className="input" value={format} onChange={e=>setFormat(e.currentTarget.value)}><option value="">{t.none}</option><option value="35:45">35 × 45 mm</option><option value="50:50">50 × 50 mm</option><option value="40:60">40 × 60 mm</option></select></label>
 {difference!==null?<p className={difference>3?"di-warning":""}>{t.diff}: <bdi>{difference.toFixed(1)}%</bdi></p>:null}
 {src?<img className="di-photo-original" src={src} alt={t.alt}/>:null}<fieldset><legend>{t.manual} · <bdi>{checks.filter(Boolean).length}/4</bdi></legend>{t.checks.map((label,i)=><label className="di-confirm" key={i}><input type="checkbox" checked={checks[i]} onChange={e=>{const v=e.currentTarget.checked;setChecks(prev=>prev.map((x,j)=>i===j?v:x))}}/>{label}</label>)}</fieldset><small>{t.note}</small></section>
}
