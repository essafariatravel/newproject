"use client";
import {useEffect,useState} from "react";
import {DatePicker} from "@/components/date-picker";
import {expiryAssessment,type GuardIssue} from "@/lib/document-intelligence";
import {inspectDocuments,type GuardResult} from "@/lib/document-guard-browser";
type Locale="fr"|"en"|"ar";
export const guardCopy={
  "fr": {
    "expiry": "Date d’expiration du passeport",
    "optional": "Facultatif · estimation locale",
    "valid": "Passeport valide à la date de référence",
    "expired": "Passeport expiré ou arrivant à expiration à la date de référence.",
    "invalid": "Date d’expiration invalide.",
    "missing": "Date d’expiration non renseignée.",
    "days": "jours restants",
    "reference": "Date de référence",
    "rules": "Exigences propres au visa non vérifiées automatiquement.",
    "checking": "Analyse automatique des documents…",
    "clear": "Aucun risque détecté par les contrôles disponibles",
    "risk": "Documents à vérifier",
    "technical": "Fichier invalide ou illisible : remplacez-le avant de soumettre.",
    "accept": "Continuer malgré les avertissements",
    "ack": "Je comprends que les pièces signalées peuvent être refusées.",
    "fix": "Corriger les documents",
    "riskNote": "Les documents signalés risquent de ne pas être acceptés. L’analyse locale ne garantit pas la conformité consulaire.",
    "issues": {
      "invalidFile": "Format réel incompatible avec l’extension du fichier.",
      "unreadable": "Image illisible ou dimensions non prises en charge.",
      "limited": "Contrôle limité : le contenu n’a pas pu être analysé.",
      "landscape": "Format paysage : document probable à la place d’une photo d’identité. Remplacez la photo.",
      "photoShape": "Format inhabituel pour une photo d’identité. Remplacez ou vérifiez la photo.",
      "photoTooSmall": "Photo de faible résolution.",
      "lowResolution": "Image de faible résolution.",
      "blur": "Netteté insuffisante probable.",
      "exposure": "Exposition inhabituelle.",
      "contrast": "Contraste faible.",
      "noFace": "Aucun visage détecté.",
      "multipleFaces": "Plusieurs visages détectés.",
      "faceSize": "Taille du visage inhabituelle dans le cadre.",
      "facePosition": "Visage probablement mal centré.",
      "background": "Arrière-plan potentiellement irrégulier.",
      "faceUnavailable": "Analyse du visage indisponible sur cet appareil.",
      "portraitInDocument": "Portrait probable au lieu du document demandé.",
      "duplicate": "Fichier identique réutilisé dans le dossier.",
      "similar": "Image très similaire à une autre pièce du dossier."
    }
  },
  "en": {
    "expiry": "Passport expiry date",
    "optional": "Optional · local estimate",
    "valid": "Passport valid on the reference date",
    "expired": "Passport expired or expires on the reference date.",
    "invalid": "Invalid expiry date.",
    "missing": "Expiry date not provided.",
    "days": "days remaining",
    "reference": "Reference date",
    "rules": "Visa-specific requirements are not verified automatically.",
    "checking": "Automatically checking documents…",
    "clear": "No risk detected by available checks",
    "risk": "Documents to review",
    "technical": "Invalid or unreadable file: replace before submitting.",
    "accept": "Continue despite warnings",
    "ack": "I understand that flagged documents may be rejected.",
    "fix": "Correct documents",
    "riskNote": "Flagged documents may not be accepted. Local analysis does not guarantee consular compliance.",
    "issues": {
      "invalidFile": "Actual format does not match the file extension.",
      "unreadable": "Unreadable image or unsupported dimensions.",
      "limited": "Limited check: contents could not be analysed.",
      "landscape": "Landscape format: likely a document instead of an identity photo. Replace the photo.",
      "photoShape": "Unusual identity photo format. Replace or check the photo.",
      "photoTooSmall": "Low-resolution photo.",
      "lowResolution": "Low-resolution image.",
      "blur": "Potentially insufficient sharpness.",
      "exposure": "Unusual exposure.",
      "contrast": "Low contrast.",
      "noFace": "No face detected.",
      "multipleFaces": "Multiple faces detected.",
      "faceSize": "Unusual face size in frame.",
      "facePosition": "Face may be poorly centred.",
      "background": "Potentially uneven background.",
      "faceUnavailable": "Face analysis unavailable on this device.",
      "portraitInDocument": "Likely portrait instead of the requested document.",
      "duplicate": "Identical file reused in the application.",
      "similar": "Image very similar to another document in the application."
    }
  },
  "ar": {
    "expiry": "تاريخ انتهاء صلاحية جواز السفر",
    "optional": "اختياري · تقدير محلي",
    "valid": "جواز السفر صالح في التاريخ المرجعي",
    "expired": "جواز السفر منتهي الصلاحية أو ينتهي في التاريخ المرجعي.",
    "invalid": "تاريخ انتهاء غير صالح.",
    "missing": "لم يتم إدخال تاريخ الانتهاء.",
    "days": "أيام متبقية",
    "reference": "التاريخ المرجعي",
    "rules": "لا يتم التحقق آلياً من متطلبات التأشيرة الخاصة.",
    "checking": "جارٍ فحص الوثائق تلقائياً…",
    "clear": "لم ترصد الفحوص المتاحة مخاطر",
    "risk": "وثائق تحتاج إلى مراجعة",
    "technical": "ملف غير صالح أو غير قابل للقراءة: استبدلوه قبل الإرسال.",
    "accept": "المتابعة رغم التنبيهات",
    "ack": "أفهم أن الوثائق المشار إليها قد تُرفض.",
    "fix": "تصحيح الوثائق",
    "riskNote": "قد لا تُقبل الوثائق المشار إليها. الفحص المحلي لا يضمن المطابقة القنصلية.",
    "issues": {
      "invalidFile": "التنسيق الفعلي لا يطابق امتداد الملف.",
      "unreadable": "صورة غير قابلة للقراءة أو أبعاد غير مدعومة.",
      "limited": "فحص محدود: تعذر تحليل المحتوى.",
      "landscape": "تنسيق أفقي: وثيقة محتملة بدلاً من صورة الهوية. استبدلوا الصورة.",
      "photoShape": "تنسيق غير معتاد لصورة الهوية. تحققوا من الصورة أو استبدلوها.",
      "photoTooSmall": "دقة الصورة منخفضة.",
      "lowResolution": "دقة الصورة منخفضة.",
      "blur": "وضوح غير كافٍ محتمل.",
      "exposure": "إضاءة غير معتادة.",
      "contrast": "تباين ضعيف.",
      "noFace": "لم يتم رصد وجه.",
      "multipleFaces": "تم رصد عدة وجوه.",
      "faceSize": "حجم الوجه غير معتاد.",
      "facePosition": "الوجه غير متمركز على الأرجح.",
      "background": "خلفية غير متجانسة محتملة.",
      "faceUnavailable": "فحص الوجه غير متاح على هذا الجهاز.",
      "portraitInDocument": "صورة شخصية محتملة بدلاً من الوثيقة المطلوبة.",
      "duplicate": "ملف مطابق مكرر في الطلب.",
      "similar": "صورة مشابهة جداً لوثيقة أخرى في الطلب."
    }
  }
} as const;
type Requirement={documentTypeId:string;name:string;code:string};
export function useDocumentGuard(enabled:boolean,files:Record<string,File[]>,requirements:readonly Requirement[]){
 const [result,setResult]=useState<{files:Record<string,File[]>;requirements:readonly Requirement[];value:GuardResult}|null>(null);
 const hasFiles=enabled&&requirements.some(r=>(files[r.documentTypeId]??[]).length>0);
 useEffect(()=>{if(!hasFiles)return;let live=true;void inspectDocuments(files,requirements,()=>live).then(value=>{if(live)setResult({files,requirements,value})}).catch(()=>{if(live)setResult({files,requirements,value:{byId:Object.fromEntries(requirements.filter(r=>(files[r.documentTypeId]??[]).length).map(r=>[r.documentTypeId,["limited"] as GuardIssue[]])),checked:0,total:0}})});return()=>{live=false}},[hasFiles,files,requirements]);
 const current=hasFiles&&result?.files===files&&result.requirements===requirements?result.value:null;
 return {result:current,checking:hasFiles&&!current};
}
export function PassportValidity({locale,today,departure,value,onChange,disabled}:{locale:Locale;today:string;departure:string;value:string;onChange:(v:string)=>void;disabled:boolean}){
 const t=guardCopy[locale],a=expiryAssessment(value,today,departure);
 return <div className="di-validity"><label className="label" htmlFor="passport-expiry">{t.expiry}</label>
 <DatePicker id="passport-expiry" name="passportExpiryEstimate" locale={locale} displayDayFirst defaultValue={value} todayValue={today} min="1900-01-01" max="2100-12-31" placeholder={locale==="fr"?"JJ/MM/AAAA":"DD/MM/YYYY"} ariaLabel={t.expiry} disabled={disabled} invalid={a.state==="invalid"} onValueChange={onChange}/>
 {a.state==="missing"?<small>{t.optional}</small>:<PassportValiditySummary locale={locale} today={today} departure={departure} value={value}/>}
 </div>
}
export function PassportValiditySummary({locale,today,departure,value}:{locale:Locale;today:string;departure:string;value:string}){
 const t=guardCopy[locale],a=expiryAssessment(value,today,departure);
 const message=a.state==="missing"?t.missing:a.state==="invalid"?t.invalid:a.state==="expired"?t.expired:t.valid;
 return <div className="di-validity-result" data-risk={a.state!=="valid"} role="status"><strong>{message}</strong>{value&&a.days!==null?<small><bdi>{value}</bdi> · <bdi>{a.days}</bdi> {t.days} · {t.reference}: <bdi>{a.reference}</bdi></small>:null}<small>{t.rules}</small></div>
}
export function GuardSummary({locale,checking,issues,onFix}:{locale:Locale;checking:boolean;issues:{name:string;messages:string[]}[];onFix?:()=>void}){
 const t=guardCopy[locale];
 if(checking)return <p role="status" className="booking-muted">{t.checking}</p>;
 if(!issues.length)return null;
 return <section className="di-guard-summary" role="status"><strong>{t.risk} · <bdi>{issues.length}</bdi></strong>{issues.map((r,i)=><div key={i}><strong>{r.name}</strong><ul>{r.messages.map(m=><li key={m}>{m}</li>)}</ul></div>)}<small>{t.riskNote}</small>{onFix?<button type="button" className="booking-link" onClick={onFix}>{t.fix}</button>:null}</section>
}
