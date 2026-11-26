"use client";
import {uniqueVerifiedOcr} from "./document-intelligence";
type LocalWorker={setParameters:(params:Record<string,string>)=>Promise<unknown>;recognize:(file:Blob)=>Promise<{data:{text:string}}> ;terminate:()=>Promise<unknown>};
type OcrApi={createWorker:(language:string,engine:number,options:Record<string,unknown>)=>Promise<LocalWorker>};
const ASSET_ROOT="/ocr/phase2c-v1";
let loading:Promise<OcrApi>|undefined;
let active=false;
function api():Promise<OcrApi>{
 if(loading)return loading;
 loading=new Promise<OcrApi>((resolve,reject)=>{
  const script=document.createElement("script");script.src=ASSET_ROOT+"/tesseract.min.js";script.async=true;
  const timer=setTimeout(()=>{script.remove();reject(Error("Local OCR unavailable"))},15000);
  script.onload=()=>{clearTimeout(timer);const t=(window as unknown as {Tesseract?:OcrApi}).Tesseract;if(typeof t?.createWorker==="function")resolve(t);else{script.remove();reject(Error("Local OCR unavailable"))}};
  script.onerror=()=>{clearTimeout(timer);script.remove();reject(Error("Local OCR unavailable"))};
  document.head.append(script);
 }).catch(error=>{loading=undefined;throw error});
 return loading;
}
export function portableOcrAvailable():boolean{return typeof window!=="undefined"&&typeof Worker==="function"&&typeof WebAssembly==="object"&&typeof createImageBitmap==="function"}
/** No uploads, local worker only. No language data cached in IndexedDB. */
export async function portablePassportOcr(image:Blob):Promise<string>{
 if(!portableOcrAvailable()||active||image.size<=0||image.size>20*1024*1024)throw Error("Local OCR unavailable");
 active=true;let worker:LocalWorker|undefined,expired=false,pending=false;let timer:ReturnType<typeof setTimeout>|undefined;
 const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(Error("Local OCR timeout"))},60000)});
 const job=(async()=>{
  const t=await api();if(expired)throw Error("Local OCR timeout");
  const root=new URL(ASSET_ROOT,window.location.origin).href;
  pending=true;
  try{worker=await t.createWorker("eng",1,{workerPath:root+"/worker.min.js",corePath:root,langPath:root,cacheMethod:"none",gzip:true,workerBlobURL:false,errorHandler:()=>{}})}
  finally{pending=false;if(expired)active=false}
  if(expired){await worker.terminate();throw Error("Local OCR timeout")}
  await worker.setParameters({tessedit_char_whitelist:"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<",tessedit_pageseg_mode:"6",preserve_interword_spaces:"0"});
  const result=await worker.recognize(image);
  const mrz=uniqueVerifiedOcr([result.data.text]);
  if(!mrz)throw Error("Incomplete or ambiguous MRZ");
  return mrz;
 })();
 try{return await Promise.race([job,timeout])}finally{
  if(timer!==undefined)clearTimeout(timer);
  if(worker)await worker.terminate().catch(()=>{});
  // A stuck initialisation is not allowed to create unbounded workers.
  if(!pending)active=false;
 }
}
