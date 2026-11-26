"use client";
import {imageSignals,duplicateGroups,uniqueVerifiedOcr} from "./document-intelligence";
export const LOCAL_FILE_LIMIT=2*1024*1024;
export function localImage(file:File):boolean{return file.size>0&&file.size<=LOCAL_FILE_LIMIT&&/^image\/(jpeg|png|webp)$/.test(file.type)}
async function bitmap(file:File):Promise<ImageBitmap>{
 if(!localImage(file))throw Error("Unsupported local image");
 const b=await createImageBitmap(file);
 if(b.width*b.height>24000000||b.width<3||b.height<3){b.close();throw Error("Image dimensions unsupported")}
 return b;
}
function canvas(w:number,h:number){const c=document.createElement("canvas");c.width=w;c.height=h;const ctx=c.getContext("2d",{willReadFrequently:true});if(!ctx)throw Error("Canvas unavailable");return {c,ctx}}
export async function inspectImage(file:File){
 const b=await bitmap(file);
 try{const scale=Math.min(1,384/Math.max(b.width,b.height));const w=Math.max(3,Math.round(b.width*scale)),h=Math.max(3,Math.round(b.height*scale));const {c,ctx}=canvas(w,h);try{ctx.drawImage(b,0,0,w,h);return imageSignals(ctx.getImageData(0,0,w,h).data,w,h,b.width,b.height)}finally{c.width=c.height=0}}finally{b.close()}
}
type Detector={detect:(source:ImageBitmap|HTMLCanvasElement)=>Promise<{rawValue?:string}[]>};
function detectorConstructor(){return (globalThis as unknown as {TextDetector?:new()=>Detector}).TextDetector}
export function nativeOcrAvailable(){return typeof detectorConstructor()==="function"}
/** Experimental browser-native OCR only; no external service or model fetch. */
export async function localPassportOcr(file:File):Promise<string>{
 const Detector=detectorConstructor();if(!Detector)throw Error("Native OCR unavailable");
 const detector=new Detector();
 const b=await bitmap(file);
 const readings:string[]=[];
 const deadline=performance.now()+12000;
 async function detect(source:ImageBitmap|HTMLCanvasElement):Promise<string>{
  const remaining=deadline-performance.now();
  if(remaining<=0)throw Error("OCR timeout");
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{
   const result=await Promise.race([
    detector.detect(source),
    new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error("OCR timeout")),remaining)})
   ]);
   return result.slice(0,100).map(r=>(r.rawValue??"").slice(0,2048)).join("\n");
  }finally{if(timer!==undefined)clearTimeout(timer)}
 }
 try{
  // First read the original. Then try the lower portion at bounded resolution
  // because passport MRZ lines are usually located near the lower edge.
  try{readings.push(await detect(b))}catch{ /* Try the bounded crop if time remains. */ }
  if(performance.now()>=deadline)throw Error("OCR timeout");
  const sy=Math.floor(b.height*.45),sh=b.height-sy;
  const scale=Math.min(1,1800/b.width,1200/sh);
  const {c,ctx}=canvas(Math.max(1,Math.round(b.width*scale)),Math.max(1,Math.round(sh*scale)));
  try{ctx.fillStyle="#fff";ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(b,0,sy,b.width,sh,0,0,c.width,c.height);readings.push(await detect(c))}
  catch{ /* A failed second pass must not invalidate a complete first pass. */ }
  finally{c.width=c.height=0}
  const result=uniqueVerifiedOcr(readings);
  if(!result)throw Error("OCR incomplete or ambiguous");
  return result;
 }finally{b.close()}
}
const digests=new WeakMap<File,Promise<string>>();
async function hash(file:File){
 if(file.size<=0||file.size>LOCAL_FILE_LIMIT||!globalThis.crypto?.subtle)throw Error("Hash unavailable");
 let pending=digests.get(file);if(!pending){pending=file.arrayBuffer().then(bytes=>crypto.subtle.digest("SHA-256",bytes)).then(bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,"0")).join(""));digests.set(file,pending)}
 return pending;
}
export async function findLocalDuplicates<T extends {file:File}>(items:readonly T[]){
 const rows:{item:T;hash:string}[]=[];let skipped=0;
 for(const item of items.slice(0,60)){try{rows.push({item,hash:await hash(item.file)})}catch{skipped++}}
 return {groups:duplicateGroups(rows),skipped:skipped+Math.max(0,items.length-60)};
}
/** Manual, non-destructive uniform edge crop and quarter-turn. No retouching. */
export async function scanCopy(file:File,turn:number,crop:number,pdf:boolean):Promise<Blob>{
 const b=await bitmap(file);
 try{
  const inset=Math.min(.2,Math.max(0,crop/100));const sx=Math.floor(b.width*inset),sy=Math.floor(b.height*inset),sw=b.width-2*sx,sh=b.height-2*sy;
  const scale=Math.min(1,2000/Math.max(sw,sh)),w=Math.max(1,Math.round(sw*scale)),h=Math.max(1,Math.round(sh*scale)),r=((Math.round(turn/90)%4)+4)%4;
  const {c,ctx}=canvas(r%2?h:w,r%2?w:h);
  try{
   ctx.fillStyle="#fff";ctx.fillRect(0,0,c.width,c.height);ctx.translate(c.width/2,c.height/2);ctx.rotate(r*Math.PI/2);ctx.drawImage(b,sx,sy,sw,sh,-w/2,-h/2,w,h);
   const jpg=await new Promise<Blob>((resolve,reject)=>c.toBlob(v=>v?resolve(v):reject(Error("Export failed")),"image/jpeg",.9));
   if(!pdf)return jpg;
   const {PDFDocument}=await import("pdf-lib");const doc=await PDFDocument.create();const image=await doc.embedJpg(await jpg.arrayBuffer());const p=doc.addPage([image.width,image.height]);p.drawImage(image,{x:0,y:0,width:image.width,height:image.height});const bytes=await doc.save();return new Blob([new Uint8Array(bytes)],{type:"application/pdf"});
  }finally{c.width=c.height=0}
 }finally{b.close()}
}
