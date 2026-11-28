"use client";
import {documentKind,visualIssues,signatureKind,expectedSignature,differenceHash,probablySimilar,imageSignals,type GuardIssue,type GuardImage,type FaceBox} from "./document-intelligence";
type Requirement={documentTypeId:string;code:string;name:string};
type NativeFace={boundingBox:{x:number;y:number;width:number;height:number}};
type FaceApi=new(options:{maxDetectedFaces:number;fastMode:boolean})=>{detect:(source:HTMLCanvasElement)=>Promise<NativeFace[]>};
export type GuardResult={byId:Record<string,GuardIssue[]>;checked:number;total:number};
const cache=new WeakMap<File,Promise<{hash:string|null;image:GuardImage|null;issues:GuardIssue[]}>>();
function canvas(w:number,h:number){const c=document.createElement("canvas");c.width=w;c.height=h;const ctx=c.getContext("2d",{willReadFrequently:true});if(!ctx)throw Error("Canvas unavailable");return {c,ctx}}
async function faces(c:HTMLCanvasElement):Promise<FaceBox[]|null>{
 const C=(window as unknown as {FaceDetector?:FaceApi}).FaceDetector;if(typeof C!=="function")return null;
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{const found=await Promise.race([new C({maxDetectedFaces:5,fastMode:false}).detect(c),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error("Timeout")),1800)})]);return found.map(({boundingBox:b})=>({x:b.x/c.width,y:b.y/c.height,width:b.width/c.width,height:b.height/c.height}))}
 catch{return null}finally{if(timer!==undefined)clearTimeout(timer)}
}
async function visual(file:File):Promise<GuardImage>{
 const b=await createImageBitmap(file);try{
 if(b.width*b.height>24000000||b.width<3||b.height<3)throw Error("Unsupported dimensions");
 const scale=Math.min(1,384/Math.max(b.width,b.height)),w=Math.max(3,Math.round(b.width*scale)),h=Math.max(3,Math.round(b.height*scale));
 const {c,ctx}=canvas(w,h),tiny=canvas(9,8);
 try{ctx.fillStyle="#fff";ctx.fillRect(0,0,w,h);ctx.drawImage(b,0,0,w,h);const pixels=ctx.getImageData(0,0,w,h).data;
 const signals=imageSignals(pixels,w,h,b.width,b.height);tiny.ctx.drawImage(c,0,0,9,8);const t=tiny.ctx.getImageData(0,0,9,8).data;
 const fingerprint=differenceHash(Array.from({length:72},(_,i)=>.299*t[i*4]!+.587*t[i*4+1]!+.114*t[i*4+2]!));
 let n=0,sum=0,sq=0;for(let y=0;y<h;y++)for(let x=0;x<w;x++){if(y>h*.12||!(x<w*.14||x>w*.86))continue;const i=(y*w+x)*4,v=.299*pixels[i]!+.587*pixels[i+1]!+.114*pixels[i+2]!;n++;sum+=v;sq+=v*v}
 const edgeVariation=n?Math.sqrt(Math.max(0,sq/n-(sum/n)**2)):0;
 return {signals,fingerprint,edgeVariation,faces:await faces(c)};
 }finally{c.width=c.height=tiny.c.width=tiny.c.height=0}
 }finally{b.close()}
}
async function inspect(file:File){
 let hash:string|null=null;let image:GuardImage|null=null;const issues:GuardIssue[]=[];
 if(file.size<=0||file.size>2*1024*1024)return {hash,image,issues:["invalidFile"] as GuardIssue[]};
 let buffer:ArrayBuffer;try{buffer=await file.arrayBuffer()}catch{return {hash,image,issues:["unreadable"] as GuardIssue[]}}
 const bytes=new Uint8Array(buffer),kind=signatureKind(bytes),expected=expectedSignature(file.name);
 if(kind==="unknown"||kind!==expected)return {hash,image,issues:["invalidFile"] as GuardIssue[]};
 try{hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",buffer)),x=>x.toString(16).padStart(2,"0")).join("")}catch{issues.push("limited")}
 if(kind==="jpeg"||kind==="png"||kind==="webp"){if(typeof createImageBitmap!=="function")issues.push("limited");else try{image=await visual(file)}catch{issues.push("unreadable")}}
 else issues.push("limited");
 return {hash,image,issues};
}
function cached(file:File){let p=cache.get(file);if(!p){p=inspect(file);cache.set(file,p)}return p}
export async function inspectDocuments(files:Record<string,File[]>,requirements:readonly Requirement[],active:()=>boolean):Promise<GuardResult>{
 const entries=requirements.flatMap(r=>(files[r.documentTypeId]??[]).map(file=>({r,file}))),byId:Record<string,GuardIssue[]>={};
 const add=(id:string,issue:GuardIssue)=>{const list=byId[id]??(byId[id]=[]);if(!list.includes(issue))list.push(issue)};
 const seen:{id:string;hash:string|null;image:GuardImage|null}[]=[];
 for(const {r,file} of entries.slice(0,60)){
  if(!active())break;
  const id=r.documentTypeId;const result=await cached(file).catch(()=>({hash:null,image:null,issues:["limited"] as GuardIssue[]}));
  for(const issue of result.issues)add(id,issue);
  const kind=documentKind(r.code,r.name);
  if(result.image)for(const issue of visualIssues(kind,result.image))add(id,issue);
  else if(kind==="photo"&&!result.issues.includes("invalidFile")&&!result.issues.includes("unreadable"))add(id,"photoShape");
  for(const prior of seen){
   if(result.hash&&prior.hash===result.hash){add(prior.id,"duplicate");add(id,"duplicate")}
   else if(result.image&&prior.image&&probablySimilar(result.image,prior.image)){add(prior.id,"similar");add(id,"similar")}
  }
  seen.push({id,hash:result.hash,image:result.image});
 }
 for(const {r} of entries.slice(60))add(r.documentTypeId,"limited");
 return {byId,checked:Math.min(entries.length,60),total:entries.length};
}
