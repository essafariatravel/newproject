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
