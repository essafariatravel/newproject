import type {ReuseFile} from "@/lib/traveller-hub-policy";
const refs=new WeakMap<File,{profileId:string;documentId:string;vault:boolean}>();
export async function travellerFileReference(file:File,profileId:string|undefined){const r=refs.get(file);if(!r||r.profileId!==profileId)return null;const digest=await crypto.subtle.digest("SHA-256",await file.arrayBuffer());return {...r,sha256:Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,"0")).join("")}}
export async function fetchTravellerFile(sourceId:string,programmeId:string,d:ReuseFile,signal:AbortSignal){
 const path="/api/agency/travellers/"+sourceId+(d.vault?"/vault/":"/passport/")+d.id+"?programme="+encodeURIComponent(programmeId);
 const r=await fetch(path,{cache:"no-store",signal,headers:{"X-Document-Intent":"download"}});
 if(!r.ok||Number(r.headers.get("content-length"))!==d.size)throw Error("Unavailable");
 const blob=await r.blob();if(blob.size!==d.size||blob.type.toLowerCase()!==d.mime.toLowerCase())throw Error("Unavailable");
 const file=new File([blob],d.name,{type:blob.type});refs.set(file,{profileId:sourceId,documentId:d.id,vault:Boolean(d.vault)});return file;
}
