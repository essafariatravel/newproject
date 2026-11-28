import type {ReuseFile} from "@/lib/traveller-hub-policy";
export async function fetchTravellerFile(sourceId:string,programmeId:string,d:ReuseFile,signal:AbortSignal){
 const path="/api/agency/travellers/"+sourceId+(d.vault?"/vault/":"/passport/")+d.id+"?programme="+encodeURIComponent(programmeId);
 const r=await fetch(path,{cache:"no-store",signal,headers:{"X-Document-Intent":"download"}});
 if(!r.ok||Number(r.headers.get("content-length"))!==d.size)throw Error("Unavailable");
 const blob=await r.blob();if(blob.size!==d.size||blob.type.toLowerCase()!==d.mime.toLowerCase())throw Error("Unavailable");
 return new File([blob],d.name,{type:blob.type});
}
