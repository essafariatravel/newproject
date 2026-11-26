/** Scope-bound, in-memory feed reuse. No local/session storage, no auth tokens.
 * A follower MUST authenticate with the server before consuming a peer packet.
 * If coordination is unavailable or a packet is stale, use the ordinary API.
 */
export const FEED_REUSE_MS=3000;
type Feed={unread:number;events:unknown[]};
type Packet={scope:string;at:number;feed:Feed};
export function validPeerFeed(value:unknown):value is Feed{
 if(!value||typeof value!=="object")return false;
 const f=value as Feed;
 return Number.isSafeInteger(f.unread)&&f.unread>=0&&Array.isArray(f.events)&&f.events.length<=32&&f.events.every(e=>{
  if(!e||typeof e!=="object")return false;
  const n=e as Record<string,unknown>;
  const optionalText=["readAt","type","applicationId","context","reference","digestKey"];
  if(optionalText.some(key=>n[key]!==undefined&&n[key]!==null&&typeof n[key]!=="string"))return false;
  if(n.priority!==undefined&&typeof n.priority!=="boolean")return false;
  if(n.actionTotal!==undefined&&(!Number.isSafeInteger(n.actionTotal)||Number(n.actionTotal)<0))return false;
  return typeof n.id==="string"&&typeof n.title==="string"&&typeof n.createdAt==="string"&&Number.isFinite(Date.parse(n.createdAt))&&(n.link===null||(typeof n.link==="string"&&/^\/portal(?:[/?#]|$)/.test(n.link)&&!n.link.includes("\\")&&!n.link.includes("..")&&!/%2f|%5c|%2e/i.test(n.link)));
 });
}
export function freshPeerFeed(value:unknown,scope:string,now=Date.now()):value is Packet{
 if(!value||typeof value!=="object")return false;
 const p=value as Packet;
 return p.scope===scope&&Number.isFinite(p.at)&&p.at<=now&&now-p.at<FEED_REUSE_MS&&validPeerFeed(p.feed);
}
export function createNotificationSharing(scope:string){
 const headers={"X-Essafaria-Notification-Scope":scope};
 const direct=(signal:AbortSignal)=>fetch("/api/notifications",{cache:"no-store",signal,headers});
 let channel:BroadcastChannel|undefined,last:Packet|undefined,closed=false;
 try{if(typeof BroadcastChannel!=="undefined"&&typeof navigator!=="undefined"&&navigator.locks){
  channel=new BroadcastChannel("essafaria-bell-v1:"+scope);
  channel.onmessage=(event:MessageEvent<unknown>)=>{if(!closed&&freshPeerFeed(event.data,scope)&&(!last||event.data.at>=last.at))last=event.data};
 }}catch{channel?.close();channel=undefined}
 async function read(signal:AbortSignal):Promise<Response>{
  if(!channel||closed)return direct(signal);
  return navigator.locks.request("essafaria-bell-v1:"+scope,{signal},async()=>{
   if(closed||signal.aborted)throw new DOMException("Aborted","AbortError");
   const candidate=last;
   if(freshPeerFeed(candidate,scope)){
    // This is an authenticated probe of the current cookie, user, role, locale
    // and credential generation. No follower displays a packet before it passes.
    const probe=await fetch("/api/notifications",{cache:"no-store",signal,headers:{...headers,"X-Essafaria-Notification-Probe":"1"}});
    if(probe.status===401||probe.status===403){last=undefined;return probe;}
    if(probe.ok&&freshPeerFeed(candidate,scope)&&!closed&&!signal.aborted){
     const proof:unknown=await probe.json();
     if(proof&&typeof proof==="object"&&"scope" in proof&&proof.scope===scope&&freshPeerFeed(candidate,scope)&&!signal.aborted&&!closed)return new Response(JSON.stringify(candidate.feed),{headers:{"Content-Type":"application/json","Cache-Control":"private, no-store"}});
    }
   }
   const response=await direct(signal);
   if(response.ok&&!closed&&!signal.aborted){
    // Clone: the original response is consumed by the normal polling loop.
    try{const feed:unknown=await response.clone().json();if(!closed&&!signal.aborted&&validPeerFeed(feed)){
     const packet={scope,at:Date.now(),feed};last=packet;channel?.postMessage(packet);
    }}catch{/* A malformed feed never becomes shared state. */}
   }
   return response;
  }).catch(error=>{
   // Lock/channel failure must not break the ordinary polling path.
   if(signal.aborted||closed)throw error;
   return direct(signal);
  });
 }
 return {read,close(){closed=true;last=undefined;channel?.close();channel=undefined}};
}
