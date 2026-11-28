"use client";
import {documentKind,visualIssues,signatureKind,expectedSignature,differenceHash,probablySimilar,pdfPageIssues,blankPdfPage,classifyVisual,type GuardIssue,type GuardImage,type FaceBox} from "./document-intelligence";
import {localFaces} from "./document-face-local";
import {inspectPdf,type PdfReport} from "./document-pdf-local";
import {analyseInWorker} from "./document-analysis-worker-client";
type Requirement={documentTypeId:string;code:string;name:string};
type NativeFace={boundingBox:{x:number;y:number;width:number;height:number}};
type FaceApi=new(options:{maxDetectedFaces:number;fastMode:boolean})=>{detect:(source:HTMLCanvasElement)=>Promise<NativeFace[]>};
export type GuardFileReport={image:GuardImage|null;issues:GuardIssue[];pdf?:{total:number;analysed:number}};
export type GuardResult={byId:Record<string,GuardIssue[]>;reports:Map<File,GuardFileReport>;checked:number;total:number};
type Inspection={hash:string|null;image:GuardImage|null;issues:GuardIssue[];pdf?:PdfReport};
const cache=new WeakMap<File,Promise<Inspection>>();
function canvas(w:number,h:number){const c=document.createElement("canvas");c.width=w;c.height=h;const ctx=c.getContext("2d",{willReadFrequently:true});if(!ctx)throw Error("Canvas unavailable");return {c,ctx}}
async function faces(c:HTMLCanvasElement):Promise<FaceBox[]|null>{
 const C=(window as unknown as {FaceDetector?:FaceApi}).FaceDetector;if(typeof C!=="function")return localFaces(c);
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{const found=await Promise.race([new C({maxDetectedFaces:5,fastMode:false}).detect(c),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error("Timeout")),1800)})]);return found.map(({boundingBox:b})=>({x:b.x/c.width,y:b.y/c.height,width:b.width/c.width,height:b.height/c.height}))}
 catch{return localFaces(c)}finally{if(timer!==undefined)clearTimeout(timer)}
}
async function analyseCanvas(c:HTMLCanvasElement,originalWidth=c.width,originalHeight=c.height):Promise<GuardImage>{
 const w=c.width,h=c.height,ctx=c.getContext("2d",{willReadFrequently:true});if(!ctx)throw Error("Canvas unavailable");
 const tiny=canvas(9,8);
 try{
 const pixels=ctx.getImageData(0,0,w,h).data;
 tiny.ctx.drawImage(c,0,0,9,8);const t=tiny.ctx.getImageData(0,0,9,8).data;
 const fingerprint=differenceHash(Array.from({length:72},(_,i)=>.299*t[i*4]!+.587*t[i*4+1]!+.114*t[i*4+2]!));
 // Cheap white-page screen avoids unnecessary face inference; final metrics run in the worker.
 let white=true;for(let i=0;i<t.length;i+=4){if(Math.min(t[i]!,t[i+1]!,t[i+2]!)<245){white=false;break}}
 const detected=white?[]:await faces(c);
 return await analyseInWorker({pixels,w,h,originalWidth,originalHeight,fingerprint,faces:detected});
 }finally{tiny.c.width=tiny.c.height=0}
}
async function visual(file:File):Promise<GuardImage>{
 const b=await createImageBitmap(file);try{
 if(b.width*b.height>24000000||b.width<3||b.height<3)throw Error("Unsupported dimensions");
 const scale=Math.min(1,384/Math.max(b.width,b.height)),w=Math.max(3,Math.round(b.width*scale)),h=Math.max(3,Math.round(b.height*scale));
 const {c,ctx}=canvas(w,h);
 try{ctx.fillStyle="#fff";ctx.fillRect(0,0,w,h);ctx.drawImage(b,0,0,w,h);return await analyseCanvas(c,b.width,b.height)}
 finally{c.width=c.height=0}
 }finally{b.close()}
}
async function inspect(file:File):Promise<Inspection>{
 let hash:string|null=null;let image:GuardImage|null=null;const issues:GuardIssue[]=[];
 if(file.size<=0||file.size>2*1024*1024)return {hash,image,issues:["invalidFile"] as GuardIssue[]};
 let buffer:ArrayBuffer;try{buffer=await file.arrayBuffer()}catch{return {hash,image,issues:["unreadable"] as GuardIssue[]}}
 const bytes=new Uint8Array(buffer),kind=signatureKind(bytes),expected=expectedSignature(file.name);
 if(kind==="unknown"||kind!==expected)return {hash,image,issues:["invalidFile"] as GuardIssue[]};
 try{hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",buffer)),x=>x.toString(16).padStart(2,"0")).join("")}catch{issues.push("limited")}
 if(kind==="jpeg"||kind==="png"||kind==="webp"){if(typeof createImageBitmap!=="function")issues.push("limited");else try{image=await visual(file)}catch{issues.push("unreadable")}}
 else if(kind==="pdf"){const pdf=await inspectPdf(buffer,analyseCanvas);return {hash,image:pdf.pages.find(p=>!blankPdfPage(p.signals))??pdf.pages[0]??null,issues:[...pdf.issues,...pdfPageIssues(pdf.pages,pdf.total)],pdf}}
 else issues.push("limited");
 return {hash,image,issues};
}
function cached(file:File){let p=cache.get(file);if(!p){p=inspect(file);cache.set(file,p)}return p}
export async function inspectDocuments(files:Record<string,File[]>,requirements:readonly Requirement[],active:()=>boolean,priority:()=>string=()=> ""):Promise<GuardResult>{
 const entries=requirements.flatMap(r=>(files[r.documentTypeId]??[]).map(file=>({r,file}))),byId:Record<string,GuardIssue[]>={},reports=new Map<File,GuardFileReport>();
 const add=(id:string,issue:GuardIssue)=>{const list=byId[id]??(byId[id]=[]);if(!list.includes(issue))list.push(issue)};
 const seen:{id:string;hash:string|null;image:GuardImage|null}[]=[];
 const pending=entries.slice(0,60);
 while(pending.length){
  if(!active())break;
  const at=pending.findIndex(e=>e.r.documentTypeId===priority());const {r,file}=pending.splice(at<0?0:at,1)[0]!;
  const id=r.documentTypeId;const result:Inspection=await cached(file).catch(()=>({hash:null,image:null,issues:["limited"] as GuardIssue[]}));
  const kind=documentKind(r.code,r.name),issues=[...result.issues];
  if(result.pdf){
   const pages=result.pdf.pages.filter(p=>!blankPdfPage(p.signals));
   if(pages.length){for(const page of pages)issues.push(...visualIssues(kind,page));if(kind==="photo"&&result.pdf.total!==1)issues.push("photoShape");if(kind!=="photo"&&pages.every(p=>classifyVisual(p)==="portrait"))issues.push("portraitInDocument")}
  }else if(result.image)issues.push(...visualIssues(kind,result.image));
  else if(kind==="photo"&&!issues.includes("invalidFile")&&!issues.includes("unreadable"))issues.push("photoShape");
  reports.set(file,{image:result.image,issues:[...new Set(issues)],...(result.pdf?{pdf:{total:result.pdf.total,analysed:result.pdf.analysed}}:{})});
  for(const issue of issues)add(id,issue);
  for(const prior of seen){
   if(result.hash&&prior.hash===result.hash){add(prior.id,"duplicate");add(id,"duplicate")}
   else if(result.image&&prior.image&&probablySimilar(result.image,prior.image)){add(prior.id,"similar");add(id,"similar")}
  }
  seen.push({id,hash:result.hash,image:result.image});
  await new Promise<void>(resolve=>setTimeout(resolve,0));
 }
 for(const {r,file} of entries.slice(60)){add(r.documentTypeId,"limited");reports.set(file,{image:null,issues:["limited"]})}
 return {byId,reports,checked:Math.min(entries.length,60),total:entries.length};
}
