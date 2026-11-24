// Presentation-only URL and queue contracts. Server queries remain the source of truth.
export type CaseQueue="all"|"active"|"attention"|"completed";
export function queueFilters(queue:CaseQueue):{queue?:"active"|"completed";documents?:"requested"}{
 if(queue==="active"||queue==="completed")return {queue};
 if(queue==="attention")return {documents:"requested"};
 return {};
}
export function caseLink(query:Record<string,string|undefined>){
 const params=new URLSearchParams();
 for(const [k,v] of Object.entries(query))if(v)params.set(k,v);
 const suffix=params.toString();
 return "/portal/applications"+(suffix?"?"+suffix:"");
}

export const CASE_SORTS=["recent","submitted","oldest","priority"] as const;
export type CaseSort=typeof CASE_SORTS[number];
export function caseSort(v:unknown):CaseSort{return CASE_SORTS.includes(v as CaseSort)?v as CaseSort:"recent"}
export function validCaseDate(v:unknown):string|undefined{
 if(typeof v!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(v))return undefined;
 const d=new Date(v+"T00:00:00Z");return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v?v:undefined;
}
export function caseSearch(value:string|undefined):{q?:string;statusCode?:string;missing?:boolean}{
 const q=(value??"").trim().slice(0,160),fold=(s:string)=>s.normalize("NFD").replace(/\p{M}/gu,"").toLowerCase();
 const normalized=fold(q);
 const patterns:[string,string[]][]=[["IN_PROCESS",["en cours","in progress","in process","قيد المعالجة"]],["APPROVED",["approuve","approuves","approved","مقبول","مقبولة"]],["SUBMITTED",["soumis","submitted","مقدم"]],["REJECTED",["refuse","refuses","rejected","رفض"]]];
 for(const [status,terms] of patterns)for(const term of terms){
  if(normalized===term)return {statusCode:status};
  if(normalized.endsWith(" "+term))return {q:q.slice(0,-term.length).trim()||undefined,statusCode:status};
 }
 if(["documents manquants","missing documents","وثائق ناقصة"].includes(normalized))return {missing:true};
 return {q:q||undefined};
}
export function safeCaseReturn(v:unknown){
 if(typeof v!=="string"||!v.startsWith("/portal/applications?")||v.length>2048)return "/portal/applications";
 try{const u=new URL(v,"https://local.invalid");if(u.pathname!=="/portal/applications"||u.hash)return "/portal/applications";
 const p:Record<string,string>={};for(const k of ["q","status","from","to","per","queue","documents","country","sort","page","missing"]){const x=u.searchParams.get(k);if(x)p[k]=x}return caseLink(p)}catch{return "/portal/applications"}
}
export function detailLink(id:string,returnTo:string){
 const base="/portal/applications/"+encodeURIComponent(id),safe=safeCaseReturn(returnTo);
 return base+(safe==="/portal/applications"?"":"?returnTo="+encodeURIComponent(safe));
}
export function processingDuration(submitted:Date|string|null|undefined,decision:Date|string|null|undefined,closed:Date|string|null|undefined,terminal:boolean,now:Date=new Date()){
 if(!submitted)return null;const start=new Date(submitted).getTime(),stop=terminal?(decision??closed):now;
 if(!stop)return null;const end=new Date(stop).getTime();if(!Number.isFinite(start)||!Number.isFinite(end)||end<start)return null;
 return {minutes:Math.floor((end-start)/60000),terminal};
}
export function durationLabel(minutes:number,locale:"fr"|"en"|"ar"){
 const d=Math.floor(minutes/1440),h=Math.floor(minutes%1440/60),m=minutes%60,f=new Intl.NumberFormat(locale);
 return locale==="fr"?(d?f.format(d)+" j "+f.format(h)+" h":h?f.format(h)+" h "+f.format(m)+" min":f.format(m)+" min"):locale==="ar"?(d?f.format(d)+" يوم "+f.format(h)+" س":h?f.format(h)+" س "+f.format(m)+" د":f.format(m)+" د"):(d?f.format(d)+"d "+f.format(h)+"h":h?f.format(h)+"h "+f.format(m)+"m":f.format(m)+"m");
}
