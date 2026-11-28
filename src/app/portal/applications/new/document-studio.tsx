"use client";
import {useEffect,useState} from "react";
import {passportValidity,type ImageSignals} from "@/lib/document-intelligence";
import {PhotoReview} from "./photo-review";
import {findLocalDuplicates,inspectImage,localImage} from "@/lib/document-local-browser";
type Locale="fr"|"en"|"ar";
const copy={
  "fr": {
    "passport": "Validité du passeport",
    "expiry": "Date d’expiration du passeport",
    "invalid": "Date invalide. Utilisez le format AAAA-MM-JJ.",
    "remaining": "Jours de validité à la date de référence",
    "expired": "Passeport expiré à la date de référence",
    "reference": "Référence",
    "validityNote": "Calcul indicatif. Vérifiez les exigences du visa sélectionné.",
    "quality": "Contrôle qualité",
    "resolution": "Résolution",
    "low": "Résolution faible à vérifier",
    "blur": "Netteté à vérifier",
    "dark": "Exposition à vérifier",
    "contrast": "Contraste à vérifier",
    "noWarning": "Aucun signal élémentaire détecté",
    "advisory": "Indicateurs techniques approximatifs, pas de validation documentaire.",
    "photo": "Contrôle photo",
    "ratio": "Rapport largeur / hauteur",
    "photoNote": "Dimensions et exposition seulement. Fond, visage et conformité à vérifier manuellement.",
    "failed": "Analyse impossible pour ce fichier.",
    "busy": "Analyse en cours…",
    "duplicate": "Fichiers identiques détectés",
    "duplicateNote": "Vérifiez les affectations. Les fichiers ne sont pas supprimés automatiquement.",
    "partial": "Certains fichiers n’ont pas pu être comparés."
  },
  "en": {
    "passport": "Passport validity",
    "expiry": "Passport expiry date",
    "invalid": "Invalid date. Use YYYY-MM-DD.",
    "remaining": "Days of validity at reference date",
    "expired": "Passport expired at reference date",
    "reference": "Reference",
    "validityNote": "Indicative calculation. Check the selected visa requirements.",
    "quality": "Quality check",
    "resolution": "Resolution",
    "low": "Check low resolution",
    "blur": "Check sharpness",
    "dark": "Check exposure",
    "contrast": "Check contrast",
    "noWarning": "No basic signal detected",
    "advisory": "Approximate technical signals, not document validation.",
    "photo": "Photo check",
    "ratio": "Width / height ratio",
    "photoNote": "Dimensions and exposure only. Background, face and compliance require manual review.",
    "failed": "Could not analyse this file.",
    "busy": "Analysing…",
    "duplicate": "Identical files detected",
    "duplicateNote": "Check assignments. Files are not automatically deleted.",
    "partial": "Some files could not be compared."
  },
  "ar": {
    "passport": "صلاحية جواز السفر",
    "expiry": "تاريخ انتهاء صلاحية جواز السفر",
    "invalid": "تاريخ غير صالح. استخدموا YYYY-MM-DD.",
    "remaining": "أيام الصلاحية في التاريخ المرجعي",
    "expired": "الجواز منتهي الصلاحية في التاريخ المرجعي",
    "reference": "التاريخ المرجعي",
    "validityNote": "حساب إرشادي. تحققوا من متطلبات التأشيرة المختارة.",
    "quality": "فحص الجودة",
    "resolution": "الدقة",
    "low": "تحققوا من الدقة المنخفضة",
    "blur": "تحققوا من الوضوح",
    "dark": "تحققوا من الإضاءة",
    "contrast": "تحققوا من التباين",
    "noWarning": "لم تُرصد مؤشرات أساسية",
    "advisory": "مؤشرات تقنية تقريبية وليست اعتماداً للوثائق.",
    "photo": "فحص الصورة",
    "ratio": "نسبة العرض إلى الارتفاع",
    "photoNote": "الأبعاد والإضاءة فقط. الخلفية والوجه والمطابقة تحتاج إلى فحص يدوي.",
    "failed": "تعذر تحليل الملف.",
    "busy": "جارٍ التحليل…",
    "duplicate": "ملفات متطابقة",
    "duplicateNote": "تحققوا من تخصيص الملفات. لا يتم حذفها تلقائياً.",
    "partial": "تعذرت مقارنة بعض الملفات."
  }
} as const;
export function PassportValidity({locale,today,departure}:{locale:Locale;today:string;departure:string}){
 const t=copy[locale];const [expiry,setExpiry]=useState("");
 const departureDays=passportValidity(departure,today),reference=departureDays!==null&&departureDays>=0?departure:today,remaining=passportValidity(expiry,reference);
 return <details className="di-assistant"><summary>{t.passport}</summary><div className="di-body">
 <label className="di-field">{t.expiry}<input type="date" className="input" dir="ltr" value={expiry} onChange={e=>setExpiry(e.currentTarget.value)}/></label>
 {expiry&&remaining===null?<p className="di-warning" role="status">{t.invalid}</p>:null}
 {remaining!==null?<p role="status" className={remaining<=0?"di-warning":"di-good"}>{remaining<0?t.expired:t.remaining+": "+remaining} <small>{t.reference}: <bdi>{reference}</bdi></small></p>:null}<small>{t.validityNote}</small>
 </div></details>
}
export function DuplicateNotice({items,locale}:{items:Record<string,File[]>;locale:Locale}){
 const t=copy[locale];const [result,setResult]=useState<{groups:{file:File;key:string}[][];skipped:number}|null>(null);
 useEffect(()=>{let live=true;setResult(null);const rows=Object.entries(items).flatMap(([key,files])=>files.map(file=>({key,file})));if(rows.length>1)void findLocalDuplicates(rows).then(r=>{if(live)setResult(r)}).catch(()=>{if(live)setResult({groups:[],skipped:rows.length})});return()=>{live=false}},[items]);
 if(!result||(!result.groups.length&&!result.skipped))return null;
 return <div className="di-duplicates" role="status">{result.groups.length?<><strong>{t.duplicate}</strong>{result.groups.map((g,i)=><p key={i}>{g.map(x=>x.file.name).join(" · ")}</p>)}<small>{t.duplicateNote}</small></>:null}{result.skipped?<small>{t.partial}</small>:null}</div>
}

export function DocumentStudio({file,locale,photo}:{file:File;locale:Locale;photo:boolean}){
 const t=copy[locale];const [open,setOpen]=useState(false),[signals,setSignals]=useState<ImageSignals|null>(null),[failure,setFailure]=useState(false),[original,setOriginal]=useState("");
 useEffect(()=>{if(!open||!localImage(file))return;let live=true;setSignals(null);setFailure(false);void inspectImage(file).then(s=>{if(live)setSignals(s)}).catch(()=>{if(live)setFailure(true)});return()=>{live=false}},[file,open]);
 useEffect(()=>{if(!open||!photo||!localImage(file))return;const u=URL.createObjectURL(file);setOriginal(u);return()=>URL.revokeObjectURL(u)},[file,open,photo]);
 if(!localImage(file))return null;
 const warnings=signals?[Math.min(signals.width,signals.height)<300?t.low:null,signals.sharpness<60?t.blur:null,signals.mean<45||signals.mean>240?t.dark:null,signals.contrast<18?t.contrast:null].filter(Boolean):[];
 return <details className="di-assistant" open={open} onToggle={e=>setOpen(e.currentTarget.open)}><summary>{t.quality}{photo?" · "+t.photo:""}</summary>{open?<div className="di-body">
 {failure?<p className="di-warning" role="status">{t.failed}</p>:null}
 {!signals&&!failure?<p role="status">{t.busy}</p>:null}
 {signals?<div className="di-result"><div className="di-metrics"><div><small>{t.resolution}</small><strong><bdi>{signals.width} × {signals.height} px</bdi></strong></div>{photo?<div><small>{t.ratio}</small><strong><bdi>{signals.ratio.toFixed(2)}</bdi></strong></div>:null}</div>{warnings.length?<ul className="di-warning">{warnings.map(w=><li key={w}>{w}</li>)}</ul>:<p className="di-good">{t.noWarning}</p>}<small>{t.advisory}</small>{photo?<><p>{t.photoNote}</p><PhotoReview locale={locale} signals={signals} src={original}/></>:null}</div>:null}
 </div>:null}</details>
}
