"use client";
import {useEffect,useId,useRef,useState} from "react";
import {useFormStatus} from "react-dom";
import {ALLOWED_MIME_TYPES,MAX_UPLOAD_BYTES} from "@/lib/types";
type Locale="fr"|"en"|"ar";
const labels={
 fr:{drop:"Déposez votre document ici",browse:"Parcourir les fichiers",or:"ou sélectionnez un fichier",formats:"PDF, JPEG, PNG, WEBP, DOC, DOCX · 2 Mo max.",invalid:"Format non autorisé. Choisissez un fichier compatible.",size:"Le fichier doit contenir des données et ne pas dépasser 2 Mo.",single:"Sélectionnez un seul fichier.",fallback:"Glisser-déposer indisponible. Utilisez Parcourir.",change:"Changer le fichier",remove:"Retirer",preview:"Vérifier avant envoi",office:"Aperçu non disponible pour ce format. Vérifiez le fichier avant envoi.",sending:"Transmission en cours…",secure:"Transmission sécurisée à ESSAFARIA",ready:"Fichier prêt à transmettre"},
 en:{drop:"Drop your document here",browse:"Browse files",or:"or select a file",formats:"PDF, JPEG, PNG, WEBP, DOC, DOCX · 2 MB max.",invalid:"Unsupported format. Choose a compatible file.",size:"The file must not be empty or exceed 2 MB.",single:"Select one file.",fallback:"Drag and drop unavailable. Use Browse.",change:"Change file",remove:"Remove",preview:"Check before sending",office:"Preview unavailable for this format. Check the file before sending.",sending:"Uploading…",secure:"Secure transmission to ESSAFARIA",ready:"File ready to send"},
 ar:{drop:"أفلت وثيقتك هنا",browse:"تصفح الملفات",or:"أو اختر ملفاً",formats:"PDF, JPEG, PNG, WEBP, DOC, DOCX · 2 MB",invalid:"صيغة غير مسموح بها. اختر ملفاً متوافقاً.",size:"يجب ألا يكون الملف فارغاً أو يتجاوز 2 ميغابايت.",single:"اختر ملفاً واحداً.",fallback:"السحب والإفلات غير متاح. استخدم التصفح.",change:"تغيير الملف",remove:"إزالة",preview:"تحقق قبل الإرسال",office:"المعاينة غير متاحة لهذه الصيغة. تحقق من الملف قبل الإرسال.",sending:"جارٍ الإرسال…",secure:"إرسال آمن إلى ESSAFARIA",ready:"الملف جاهز للإرسال"}
};
export function SmartDocumentUpload({locale,label,submitLabel}:{locale:Locale;label:string;submitLabel:string}){
 const t=labels[locale],id=useId(),input=useRef<HTMLInputElement>(null),{pending}=useFormStatus();
 const [file,setFile]=useState<File|null>(null),[error,setError]=useState(""),[drag,setDrag]=useState(false),[url,setUrl]=useState("");
 const previewable=!!file&&["application/pdf","image/jpeg","image/png","image/webp"].includes(file.type);
 useEffect(()=>{setUrl("");if(!file||!previewable)return;const u=URL.createObjectURL(file);setUrl(u);return()=>URL.revokeObjectURL(u)},[file,previewable]);
 function clear(message=""){if(input.current)input.current.value="";setFile(null);setError(message)}
 function accept(list:FileList|null,dropped=false){
  if(pending)return;const next=list?.[0];if(!next){clear();return}
  if(list?.length!==1){clear(t.single);return}
  if(!ALLOWED_MIME_TYPES.includes(next.type)||!/\.(pdf|jpe?g|png|webp|docx?)$/i.test(next.name)){clear(t.invalid);return}
  if(next.size===0||next.size>MAX_UPLOAD_BYTES){clear(t.size);return}
  if(dropped){try{const dt=new DataTransfer();dt.items.add(next);if(!input.current)throw Error();input.current.files=dt.files}catch{clear(t.fallback);return}}
  setFile(next);setError("");
 }
 return <div className="r092-upload" aria-busy={pending}>
 <input ref={input} id={id} className="r092-native" tabIndex={-1} type="file" name="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" aria-label={label} onChange={e=>accept(e.target.files)}/>
 {!file?<div className="r092-drop" data-drag={drag} onDragOver={e=>{e.preventDefault();if(!pending)setDrag(true)}} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setDrag(false)}} onDrop={e=>{e.preventDefault();setDrag(false);accept(e.dataTransfer.files,true)}}>
 <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M12 16V3m-5 5 5-5 5 5M4 14v6h16v-6"/></svg><strong>{t.drop}</strong><span>{t.or}</span><button type="button" className="btn-primary" onClick={()=>input.current?.click()} disabled={pending}>{t.browse}</button><small><bdi>{t.formats}</bdi></small></div>:<div className="r092-selected fluid-selected-file">
 <div className="r092-file-line"><div><strong>{t.ready}</strong><p><bdi>{file.name} · {(file.size/1024).toFixed(1)} KB</bdi></p></div><button type="button" className="btn-secondary btn-sm" disabled={pending} onClick={()=>input.current?.click()}>{t.change}</button><button type="button" className="btn-secondary btn-sm" disabled={pending} onClick={()=>clear()}>{t.remove}</button></div>
 {previewable?(url?<div className="r092-local-preview"><p>{t.preview}</p>{file.type==="application/pdf"?<iframe title={label} src={url} sandbox=""/>:<img alt={label} src={url}/>}</div>:null):<p>{t.office}</p>}
 <div className="fluid-send-bar"><span className="r092-secure">{t.secure}</span><button type="submit" className="btn-primary" disabled={pending}>{pending?t.sending:submitLabel}<span aria-hidden="true" className="directional"> →</span></button></div></div>}
 {error?<p className="r092-upload-error" role="alert">{error}</p>:null}
 {!file?<p className="r092-secure">{t.secure}</p>:null}</div>
}
export function DocumentUploadNotice({message}:{message:string}){
 const [show,setShow]=useState(true);
 useEffect(()=>{const timer=window.setTimeout(()=>setShow(false),4500);return()=>window.clearTimeout(timer)},[message]);
 useEffect(()=>{if(show)return;const url=new URL(window.location.href);if(url.searchParams.get("ok")===message){url.searchParams.delete("ok");window.history.replaceState(window.history.state,"",url.pathname+url.search+url.hash)}},[show,message]);
 return show?<div className="r092-notice" role="status"><span aria-hidden="true">✓</span>{message}<button type="button" aria-label="OK" onClick={()=>setShow(false)}>×</button></div>:null
}
