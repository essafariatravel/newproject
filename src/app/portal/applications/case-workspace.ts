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
 const p:Record<string,string>={};for(const k of ["q","status","from","to","per","queue","documents","country","sort","page","missing","focus","work"]){const x=u.searchParams.get(k);if(x)p[k]=x}return caseLink(p)}catch{return "/portal/applications"}
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
 return locale==="fr"?(d?f.format(d)+(h?" j "+f.format(h)+" h":d===1?" jour":" jours"):h?f.format(h)+" h "+f.format(m)+" min":f.format(m)+" min"):locale==="ar"?(d?f.format(d)+" يوم"+(h?" "+f.format(h)+" س":""):h?f.format(h)+" س "+f.format(m)+" د":f.format(m)+" د"):(d?f.format(d)+"d"+(h?" "+f.format(h)+"h":""):h?f.format(h)+"h "+f.format(m)+"m":f.format(m)+"m");
}

/** Dates of business search periods are Algeria-local calendar dates, independent of server TZ. */
export function casePeriod(value:string|undefined,now=new Date()):{text:string;period?:"today"|"week"|"month";from?:Date;to?:Date}{
 const q=(value??"").trim();
 const suffix=/(?:^|\s)(aujourd['’]hui|today|اليوم|cette semaine|this week|هذا الأسبوع|ce mois-ci|this month|هذا الشهر)$/iu.exec(q);
 if(!suffix)return {text:q,period:undefined,from:undefined,to:undefined};
 const term=suffix[1]!.toLowerCase(),local=new Date(now.getTime()+3600000);
 const day=new Date(Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate()));
 const kind=["today","aujourd'hui","aujourd’hui","اليوم"].includes(term)?"today":["cette semaine","this week","هذا الأسبوع"].includes(term)?"week":"month";
 const start=new Date(day),end=new Date(day);
 if(kind==="week"){start.setUTCDate(day.getUTCDate()-(day.getUTCDay()+6)%7);end.setTime(start.getTime()+7*86400000)}
 else if(kind==="month"){start.setUTCDate(1);end.setUTCMonth(start.getUTCMonth()+1,1)}
 else end.setUTCDate(day.getUTCDate()+1);
 const text=q.slice(0,suffix.index).trim().replace(/^(?:visas?|dossiers?|cases?|applications?|الطلبات|التأشيرات)\s+/iu,"");
 return {text,period:kind,from:new Date(start.getTime()-3600000),to:new Date(end.getTime()-3600000)};
}
export function caseDateTime(value:Date|string|null|undefined,locale:"fr"|"en"|"ar"){
 if(!value)return "—";const date=new Date(value);if(!Number.isFinite(date.getTime()))return "—";
 return date.toLocaleString(locale==="fr"?"fr-FR":locale==="ar"?"ar-DZ":"en-GB",{timeZone:"Africa/Algiers",day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
}
export function usableCaseDocument(status:string|undefined,requested:boolean){return !requested&&Boolean(status&&["UPLOADED","UNDER_REVIEW","ACCEPTED"].includes(status))}

export function caseDateBoundary(v:string,exclusiveEnd=false){const valid=validCaseDate(v);return valid?new Date(Date.parse(valid+"T00:00:00Z")-3600000+(exclusiveEnd?86400000:0)):undefined}
export function caseResponsibility(status:string,terminal:boolean,requested:boolean,cancellation:boolean){
 if(terminal)return "closed";
 if(requested)return "agency";
 if(cancellation)return "cancellation";
 if(status==="DRAFT")return "draft";
 if(status==="SUBMITTED")return "verification";
 if(status==="DOCUMENTS_CHECKING")return "checking";
 if(status==="IN_PROCESS")return "processing";
 if(status==="EMBASSY_SENT")return "embassy";
 return "unknown";
}

export const CASE_FOCUSES=["unread","cancellation","stale","decision"] as const;
export function caseFocus(v:unknown):typeof CASE_FOCUSES[number]|undefined{return CASE_FOCUSES.includes(v as typeof CASE_FOCUSES[number])?v as typeof CASE_FOCUSES[number]:undefined}
export function caseQueryFilters(sp:Record<string,string|undefined>){
 const period=casePeriod(sp.q),parsed=caseSearch(period.text);
 const countryId=sp.country&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sp.country)?sp.country:undefined;
 return {q:parsed.q,statusCode:sp.status||parsed.statusCode,dateFrom:validCaseDate(sp.from),dateTo:validCaseDate(sp.to),countryId,caseSort:caseSort(sp.sort),caseMissing:sp.missing==="1"||parsed.missing===true,caseEventFrom:period.from,caseEventTo:period.to,caseFocus:caseFocus(sp.focus)};
}
export function csvCell(value:string){return '"'+(/^[\s\u0000-\u001f]*[=+@-]/u.test(value)?"'"+value:value).replaceAll('"','""')+'"'}
