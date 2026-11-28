"use client";
import {useEffect,useState} from "react";
import {DatePicker} from "@/components/date-picker";
import {expiryAssessment,guardTechnical,documentKind,classifyVisual,type GuardIssue} from "@/lib/document-intelligence";
import {inspectDocuments,type GuardResult,type GuardFileReport} from "@/lib/document-guard-browser";
type Locale="fr"|"en"|"ar";
export const guardCopy={
  "fr": {
    "expiry": "Date d’expiration du passeport",
    "optional": "Minimum 7 mois · obligatoire",
    "valid": "Validité minimale respectée",
    "expired": "Passeport expiré à la date de référence.",
    "invalid": "Date d’expiration invalide.",
    "missing": "Renseignez la date d’expiration du passeport.",
    "days": "jours restants",
    "reference": "Date de la demande",
    "rules": "7 mois calendaires à compter de la date de la demande.",
    "checking": "Analyse automatique des documents…",
    "clear": "Aucune anomalie détectée par les contrôles disponibles",
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
      "portraitInDocument": "Photo portrait probable au lieu du document demandé. Remplacez ce fichier.",
      "duplicate": "Fichier identique réutilisé dans le dossier.",
      "similar": "Image très similaire à une autre pièce du dossier.",
      "documentInPhoto": "Document probable au lieu d’une photo d’identité. Remplacez la photo.",
      "typeUncertain": "Type de document non confirmé par le contrôle visuel."
    },
    "insufficient": "Validité insuffisante : 7 mois minimum requis.",
    "minimum": "Expiration minimale",
    "photoTitle": "Contrôle automatique de la photo",
    "docTitle": "Contrôle automatique du document",
    "done": "Analyse effectuée",
    "limitedResult": "Analyse partielle",
    "unavailable": "Analyse indisponible",
    "dimensions": "Résolution",
    "orientation": "Orientation",
    "portrait": "Portrait / carré",
    "landscape": "Paysage",
    "faces": "Visages détectés",
    "notChecked": "Non vérifié",
    "quality": "Qualité technique",
    "qualityOk": "Aucun signal de qualité détecté",
    "qualityRisk": "Qualité à vérifier",
    "format": "Format du fichier",
    "fileOk": "Signature contrôlée",
    "warning": "À vérifier",
    "block": "Validité du passeport insuffisante : corrigez la date avant de continuer.",
    "photoRisk": "Cette photo risque de ne pas être acceptée. Remplacez-la de préférence.",
    "docRisk": "Ce fichier risque de ne pas correspondre à la pièce demandée.",
    "shortClear": "Contrôlé",
    "shortChecking": "Analyse…",
    "shortLimited": "Contrôle partiel",
    "typeLabel": "Type visuel probable",
    "typePortrait": "Photo portrait",
    "typeDocument": "Document",
    "typeUncertain": "Type indéterminé"
  },
  "en": {
    "expiry": "Passport expiry date",
    "optional": "Minimum 7 months · required",
    "valid": "Minimum validity met",
    "expired": "Passport expired on the reference date.",
    "invalid": "Invalid expiry date.",
    "missing": "Enter the passport expiry date.",
    "days": "days remaining",
    "reference": "Application date",
    "rules": "7 calendar months from the application date.",
    "checking": "Automatically checking documents…",
    "clear": "No issue detected by available checks",
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
      "portraitInDocument": "Likely portrait photo instead of the requested document. Replace this file.",
      "duplicate": "Identical file reused in the application.",
      "similar": "Image very similar to another document in the application.",
      "documentInPhoto": "Likely document instead of an identity photo. Replace the photo.",
      "typeUncertain": "Document type could not be confirmed by visual analysis."
    },
    "insufficient": "Insufficient validity: at least 7 months required.",
    "minimum": "Earliest acceptable expiry",
    "photoTitle": "Automatic photo check",
    "docTitle": "Automatic document check",
    "done": "Analysis completed",
    "limitedResult": "Partial analysis",
    "unavailable": "Analysis unavailable",
    "dimensions": "Resolution",
    "orientation": "Orientation",
    "portrait": "Portrait / square",
    "landscape": "Landscape",
    "faces": "Faces detected",
    "notChecked": "Not checked",
    "quality": "Technical quality",
    "qualityOk": "No quality issue detected",
    "qualityRisk": "Check quality",
    "format": "File format",
    "fileOk": "Signature checked",
    "warning": "Review",
    "block": "Insufficient passport validity: correct the date before continuing.",
    "photoRisk": "This photo may not be accepted. Replace it if possible.",
    "docRisk": "This file may not match the required document.",
    "shortClear": "Checked",
    "shortChecking": "Checking…",
    "shortLimited": "Partial check",
    "typeLabel": "Likely visual type",
    "typePortrait": "Portrait photo",
    "typeDocument": "Document",
    "typeUncertain": "Uncertain type"
  },
  "ar": {
    "expiry": "تاريخ انتهاء صلاحية جواز السفر",
    "optional": "سبعة أشهر على الأقل · إلزامي",
    "valid": "الحد الأدنى للصلاحية مستوفى",
    "expired": "جواز السفر منتهي الصلاحية في التاريخ المرجعي.",
    "invalid": "تاريخ انتهاء غير صالح.",
    "missing": "أدخلوا تاريخ انتهاء صلاحية جواز السفر.",
    "days": "أيام متبقية",
    "reference": "تاريخ الطلب",
    "rules": "سبعة أشهر تقويمية من تاريخ الطلب.",
    "checking": "جارٍ فحص الوثائق تلقائياً…",
    "clear": "لم ترصد الفحوص المتاحة مشكلة",
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
      "portraitInDocument": "صورة شخصية محتملة بدلاً من الوثيقة المطلوبة. استبدلوا الملف.",
      "duplicate": "ملف مطابق مكرر في الطلب.",
      "similar": "صورة مشابهة جداً لوثيقة أخرى في الطلب.",
      "documentInPhoto": "وثيقة محتملة بدلاً من صورة الهوية. استبدلوا الصورة.",
      "typeUncertain": "لم يتم تأكيد نوع الوثيقة بالفحص المرئي."
    },
    "insufficient": "الصلاحية غير كافية: سبعة أشهر على الأقل.",
    "minimum": "أقرب تاريخ انتهاء مقبول",
    "photoTitle": "الفحص الآلي للصورة",
    "docTitle": "الفحص الآلي للوثيقة",
    "done": "اكتمل الفحص",
    "limitedResult": "فحص جزئي",
    "unavailable": "الفحص غير متاح",
    "dimensions": "الدقة",
    "orientation": "الاتجاه",
    "portrait": "عمودي / مربع",
    "landscape": "أفقي",
    "faces": "الوجوه المرصودة",
    "notChecked": "لم يتم الفحص",
    "quality": "الجودة التقنية",
    "qualityOk": "لم ترصد مشكلة في الجودة",
    "qualityRisk": "الجودة تحتاج إلى مراجعة",
    "format": "تنسيق الملف",
    "fileOk": "تم فحص توقيع الملف",
    "warning": "للمراجعة",
    "block": "صلاحية الجواز غير كافية: صححوا التاريخ قبل المتابعة.",
    "photoRisk": "قد لا تُقبل هذه الصورة. يفضل استبدالها.",
    "docRisk": "قد لا يطابق هذا الملف الوثيقة المطلوبة.",
    "shortClear": "تم الفحص",
    "shortChecking": "جارٍ الفحص…",
    "shortLimited": "فحص جزئي",
    "typeLabel": "النوع المرئي المحتمل",
    "typePortrait": "صورة شخصية",
    "typeDocument": "وثيقة",
    "typeUncertain": "نوع غير محدد"
  }
} as const;
type Requirement={documentTypeId:string;name:string;code:string};
export function useDocumentGuard(enabled:boolean,files:Record<string,File[]>,requirements:readonly Requirement[]){
 const [result,setResult]=useState<{files:Record<string,File[]>;requirements:readonly Requirement[];value:GuardResult}|null>(null);
 const hasFiles=enabled&&requirements.some(r=>(files[r.documentTypeId]??[]).length>0);
 useEffect(()=>{if(!hasFiles)return;let live=true;void inspectDocuments(files,requirements,()=>live).then(value=>{if(live)setResult({files,requirements,value})}).catch(()=>{if(live)setResult({files,requirements,value:{byId:Object.fromEntries(requirements.filter(r=>(files[r.documentTypeId]??[]).length).map(r=>[r.documentTypeId,["limited"] as GuardIssue[]])),reports:new Map(),checked:0,total:0}})});return()=>{live=false}},[hasFiles,files,requirements]);
 const current=hasFiles&&result?.files===files&&result.requirements===requirements?result.value:null;
 return {result:current,checking:hasFiles&&!current};
}
export function PassportValidity({locale,today,departure,value,onChange,disabled}:{locale:Locale;today:string;departure:string;value:string;onChange:(v:string)=>void;disabled:boolean}){
 const t=guardCopy[locale],a=expiryAssessment(value,today,departure);
 return <div className="di-validity"><div className="ops-departure-heading"><label htmlFor="passport-expiry">{t.expiry} *</label></div>
 <DatePicker id="passport-expiry" name="passportExpiryEstimate" locale={locale} displayDayFirst defaultValue={value} todayValue={today} min="1900-01-01" max="2100-12-31" placeholder={locale==="fr"?"JJ/MM/AAAA":"DD/MM/YYYY"} ariaLabel={t.expiry} disabled={disabled} required invalid={a.state==="invalid"||a.state==="expired"||a.state==="insufficient"} onValueChange={onChange}/>
 {a.state==="missing"?<small>{t.optional}</small>:<PassportValiditySummary locale={locale} today={today} departure={departure} value={value}/>}
 </div>
}
export function PassportValiditySummary({locale,today,departure,value}:{locale:Locale;today:string;departure:string;value:string}){
 const t=guardCopy[locale],a=expiryAssessment(value,today,departure);
 const message=a.state==="missing"?t.missing:a.state==="invalid"?t.invalid:a.state==="expired"?t.expired:a.state==="insufficient"?t.insufficient:t.valid;
 const format=(v:string)=>new Intl.DateTimeFormat(locale,{day:"2-digit",month:"2-digit",year:"numeric",timeZone:"UTC",calendar:"gregory"}).format(new Date(v+"T00:00:00Z"));
 return <div className="di-validity-result" data-risk={a.state!=="valid"} role="status"><strong>{message}</strong>{a.minimum?<small>{t.minimum}: <bdi>{format(a.minimum)}</bdi> · {t.reference}: <bdi>{format(a.reference)}</bdi></small>:null}{value&&a.days!==null?<small>{t.expiry}: <bdi>{format(value)}</bdi>{a.days>=0?<> · <bdi>{a.days}</bdi> {t.days}</>:null}</small>:null}<small>{t.rules}</small></div>
}
export function GuardSummary({locale,checking,issues,onFix}:{locale:Locale;checking:boolean;issues:{name:string;messages:string[]}[];onFix?:()=>void}){
 const t=guardCopy[locale];
 if(checking)return <p role="status" className="booking-muted">{t.checking}</p>;
 if(!issues.length)return null;
 return <section className="di-guard-summary" role="status"><strong>{t.risk} · <bdi>{issues.length}</bdi></strong>{issues.map((r,i)=><div key={i}><strong>{r.name}</strong><ul>{r.messages.map(m=><li key={m}>{m}</li>)}</ul></div>)}<small>{t.riskNote}</small>{onFix?<button type="button" className="booking-link" onClick={onFix}>{t.fix}</button>:null}</section>
}

export function FileGuardReport({locale,requirement,report,checking,issues}:{locale:Locale;requirement:Requirement;report:GuardFileReport|undefined;checking:boolean;issues:GuardIssue[]}){
 const t=guardCopy[locale],photo=documentKind(requirement.code,requirement.name)==="photo",image=report?.image;
 const all=[...new Set([...(report?.issues??[]),...issues])];
 const partial=all.includes("limited")||all.includes("faceUnavailable")||all.includes("typeUncertain")||!report;
 const warnings=all.filter(k=>k!=="limited"&&k!=="faceUnavailable"&&k!=="typeUncertain");
 const technical=warnings.some(guardTechnical);
 const state=checking?"checking":warnings.length?"warning":partial?"limited":"clear";
 const visualType=image?classifyVisual(image):"uncertain";
 const qualityIssues=all.some(k=>["lowResolution","photoTooSmall","blur","contrast","exposure"].includes(k));
 return <section className="di-file-report" data-state={state} aria-live="polite">
 <div className="di-report-heading"><strong>{photo?t.photoTitle:t.docTitle}</strong><span className="di-report-status"><i aria-hidden="true"/>{checking?t.shortChecking:state==="warning"?t.warning:state==="limited"?t.limitedResult:t.done}</span></div>
 {checking?<small>{t.checking}</small>:<>
 <div className="di-report-metrics">
 <div><small>{t.format}</small><strong>{report&&!technical?t.fileOk:t.notChecked}</strong></div>
 {image?<><div><small>{t.typeLabel}</small><strong>{visualType==="portrait"?t.typePortrait:visualType==="document"?t.typeDocument:t.typeUncertain}</strong></div><div><small>{t.dimensions}</small><strong><bdi>{image.signals.width} × {image.signals.height} px</bdi></strong></div><div><small>{t.quality}</small><strong>{qualityIssues?t.qualityRisk:t.qualityOk}</strong></div>
 {<><div><small>{t.orientation}</small><strong>{image.signals.ratio>1.08?t.landscape:t.portrait}</strong></div><div><small>{t.faces}</small><strong><bdi>{image.faces===null?t.notChecked:image.faces.length}</bdi></strong></div></>}</>:null}
 </div>
 {all.length?<ul>{all.map(k=><li key={k}>{t.issues[k]}</li>)}</ul>:<small>{report?t.clear:t.unavailable}</small>}
 {warnings.length?<p>{technical?t.technical:photo?t.photoRisk:t.docRisk}</p>:null}
 <small>{t.riskNote}</small></>}
 </section>
}
