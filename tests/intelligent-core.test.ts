import {describe,it,expect,vi} from "vitest";
import {runBoundedUploads} from "@/lib/bounded-upload";
import {freshPeerFeed,validPeerFeed,FEED_REUSE_MS,createNotificationSharing} from "@/lib/notification-sharing";
import {agencyNotificationScope} from "@/lib/notification-scope";
import type {AuthUser} from "@/lib/types";
describe("Intelligent Core: bounded staging",()=>{
 it("caps concurrent requests at two and preserves input order",async()=>{
  let inFlight=0,peak=0;
  const out=await runBoundedUploads([3,1,2,0],99,async n=>{peak=Math.max(peak,++inFlight);await new Promise(r=>setTimeout(r,n*5));inFlight--;return n});
  expect(peak).toBe(2);expect(out).toEqual([3,1,2,0]);
 });
 it("drains started work on failure and never starts another file",async()=>{
  const started:number[]=[],ended:number[]=[];
  await expect(runBoundedUploads([0,1,2,3],2,async n=>{started.push(n);if(n===0)throw Error("synthetic");await Promise.resolve();ended.push(n);return n})).rejects.toThrow("synthetic");
  expect(started).toEqual([0,1]);expect(ended).toEqual([1]);
 });
 it("supports the sequential fallback and an empty queue",async()=>{
  let active=0,peak=0;
  expect(await runBoundedUploads([1,2,3],1,async n=>{peak=Math.max(peak,++active);await Promise.resolve();active--;return n})).toEqual([1,2,3]);expect(peak).toBe(1);
  expect(await runBoundedUploads([],2,async n=>n)).toEqual([]);
 });
});
describe("Intelligent Core: scoped notification coordination",()=>{
 const user={id:"u",agencyId:"a",sessionId:"s",credentialVersion:1,role:"AGENCY_ADMIN"} as AuthUser;
 const scope=agencyNotificationScope(user,"fr",true)!;
 const feed={unread:1,events:[{id:"n",title:"Synthetic",createdAt:"2026-01-01T00:00:00Z",link:"/portal/applications/abc"}]};
 it("namespaces each session, tenant, role, credential generation and locale",()=>{
  for(const other of [{...user,id:"v"},{...user,agencyId:"b"},{...user,sessionId:"t"},{...user,credentialVersion:2},{...user,role:"AGENCY_USER" as const}])expect(agencyNotificationScope(other,"fr",true)).not.toBe(scope);
  expect(agencyNotificationScope(user,"ar",true)).not.toBe(scope);expect(agencyNotificationScope(user,"fr",false)).not.toBe(scope);
  expect(agencyNotificationScope({...user,mustChangePassword:true},"fr",true)).toBeNull();
 });
 it("accepts only fresh packets from the exact scope",()=>{
  expect(freshPeerFeed({scope,at:100,feed},scope,101)).toBe(true);
  expect(freshPeerFeed({scope,at:100,feed},"other",101)).toBe(false);
  expect(freshPeerFeed({scope,at:100,feed},scope,100+FEED_REUSE_MS)).toBe(false);
  expect(freshPeerFeed({scope,at:100,feed},scope,99)).toBe(false);
 });
 it("rejects unsafe navigation and malformed payloads",()=>{
  expect(validPeerFeed(feed)).toBe(true);expect(validPeerFeed({...feed,unread:-1})).toBe(false);
  for(const link of ["https://example.com","//example.com","/portal/../admin","/portal/%2e%2e/admin"])expect(validPeerFeed({...feed,events:[{...feed.events[0],link}]})).toBe(false);
  expect(validPeerFeed({...feed,events:[{...feed.events[0],digestKey:1}]})).toBe(false);
 });
});


describe("notification peer authorization",()=>{
 it("falls back to full reads if no browser coordination is available",async()=>{
  const request=vi.fn(async()=>new Response(JSON.stringify({unread:0,events:[]})));
  vi.stubGlobal("fetch",request);vi.stubGlobal("BroadcastChannel",undefined);
  const transport=createNotificationSharing("synthetic");
  try{expect((await transport.read(new AbortController().signal)).ok).toBe(true);expect(request).toHaveBeenCalledTimes(1);expect(request.mock.calls.length).toBe(1)}
  finally{transport.close();vi.unstubAllGlobals()}
 });
 it("does not display a peer packet when the session probe is forbidden",async()=>{
  let receive:((e:{data:unknown})=>void)|null=null;
  class Channel{set onmessage(fn:(e:{data:unknown})=>void){receive=fn}close(){}postMessage(){}}
  const req=vi.fn(async()=>new Response(null,{status:403}));
  vi.stubGlobal("BroadcastChannel",Channel);vi.stubGlobal("navigator",{locks:{request:async(_name:string,_options:unknown,cb:()=>Promise<Response>)=>cb()}});vi.stubGlobal("fetch",req);
  const transport=createNotificationSharing("synthetic");
  try{const dispatch=receive as ((e:{data:unknown})=>void)|null;dispatch?.({data:{scope:"synthetic",at:Date.now(),feed:{unread:1,events:[]}}});expect((await transport.read(new AbortController().signal)).status).toBe(403);expect(req).toHaveBeenCalledTimes(1)}
  finally{transport.close();vi.unstubAllGlobals()}
 });
});
