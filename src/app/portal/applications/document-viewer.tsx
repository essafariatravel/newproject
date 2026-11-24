"use client";
import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from "react";
type FileItem={id:string;name:string;mime:string};
const ViewerContext=createContext<(id:string)=>void>(()=>{});
export function DocumentPreviewButton({id,children}:{id:string;children:ReactNode}){
 const open=useContext(ViewerContext);
 return <button type="button" className="case-document-preview" onClick={()=>open(id)}>{children}</button>
}
export function DocumentViewerProvider({files,locale,children}:{files:FileItem[];locale:"fr"|"en"|"ar";children:ReactNode}){
 const dialog=useRef<HTMLDialogElement>(null),last=useRef<HTMLElement|null>(null),[index,setIndex]=useState(-1),[loaded,setLoaded]=useState<{id:string;url:string}|null>(null),[error,setError]=useState(false),[zoom,setZoom]=useState(100);
 const f=files[index],url=loaded?.id===f?.id?loaded?.url??"":"",supported=f&&["application/pdf","image/jpeg","image/png","image/webp"].includes(f.mime);
 const t={fr:{preview:"Aperçu du document",close:"Fermer",prev:"Précédent",next:"Suivant",download:"Télécharger",busy:"Chargement…",error:"Aperçu indisponible. Vous pouvez télécharger le document.",unsupported:"Ce format est disponible au téléchargement.",zoom:"Zoom"},en:{preview:"Document preview",close:"Close",prev:"Previous",next:"Next",download:"Download",busy:"Loading…",error:"Preview unavailable. You can download the document.",unsupported:"This format is available for download.",zoom:"Zoom"},ar:{preview:"معاينة الوثيقة",close:"إغلاق",prev:"السابق",next:"التالي",download:"تنزيل",busy:"جارٍ التحميل…",error:"المعاينة غير متاحة. يمكن تنزيل الوثيقة.",unsupported:"هذا التنسيق متاح للتنزيل.",zoom:"تكبير"}}[locale];
 useEffect(()=>{setLoaded(null);setError(false);setZoom(100);if(!f||!supported)return;const a=new AbortController();let objectUrl="";
 void (async()=>{try{const r=await fetch("/api/documents/"+encodeURIComponent(f.id),{cache:"no-store",signal:a.signal});if(!r.ok)throw Error("preview");const blob=await r.blob();if(blob.type.split(";")[0]!==f.mime)throw Error("mime");if(a.signal.aborted)return;objectUrl=URL.createObjectURL(blob);setLoaded({id:f.id,url:objectUrl})}catch{if(!a.signal.aborted)setError(true)}})();
 return()=>{a.abort();if(objectUrl)URL.revokeObjectURL(objectUrl)}},[f,supported]);
 function open(id:string){const i=files.findIndex(x=>x.id===id);if(i<0)return;last.current=document.activeElement instanceof HTMLElement?document.activeElement:null;setIndex(i);dialog.current?.showModal()}
 return <ViewerContext.Provider value={open}>{children}<dialog ref={dialog} className="case-viewer-dialog" aria-label={t.preview} onClose={()=>{setIndex(-1);setLoaded(null);last.current?.focus({preventScroll:true})}}>
 <div className="case-dialog-header"><h2>{f?.name??t.preview}</h2><button type="button" className="case-dialog-close" aria-label={t.close} onClick={()=>dialog.current?.close()}>×</button></div>
 {f?<><div className="case-viewer-toolbar"><button type="button" className="btn-secondary btn-sm" disabled={index===0} onClick={()=>setIndex(i=>i-1)}>{t.prev}</button><span>{index+1}/{files.length}</span><button type="button" className="btn-secondary btn-sm" disabled={index>=files.length-1} onClick={()=>setIndex(i=>i+1)}>{t.next}</button>{f.mime.startsWith("image/")?<label>{t.zoom} <input type="range" min={50} max={200} step={25} value={zoom} onChange={e=>setZoom(Number(e.target.value))}/> {zoom}%</label>:null}<a className="btn-secondary btn-sm" href={"/api/documents/"+encodeURIComponent(f.id)}>{t.download}</a></div>
 <div className="case-viewer-stage" aria-busy={Boolean(supported&&!url&&!error)}>{!supported?<p>{t.unsupported}</p>:error?<p role="alert">{t.error}</p>:!url?<p role="status">{t.busy}</p>:f.mime==="application/pdf"?<iframe title={f.name} src={url} sandbox=""/>:<img alt={f.name} src={url} style={{width:zoom+"%"}}/>}</div></>:null}</dialog></ViewerContext.Provider>
}
