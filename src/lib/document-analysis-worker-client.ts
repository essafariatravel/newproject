"use client";
import {analyseGuardPixels,type PixelAnalysisInput,type GuardImage} from "./document-intelligence";
export async function analyseInWorker(input:PixelAnalysisInput):Promise<GuardImage>{
 if(typeof Worker==="function"){
  let worker:Worker|undefined,timer:ReturnType<typeof setTimeout>|undefined;
  try{
   worker=new Worker("/document-guard/analysis-v1/worker.mjs",{type:"module"});
   const active=worker;
   return await new Promise<GuardImage>((resolve,reject)=>{
    timer=setTimeout(()=>reject(Error("Analysis timeout")),4000);
    active.onmessage=e=>{if(e.data?.ok&&e.data.result)resolve(e.data.result as GuardImage);else reject(Error("Analysis unavailable"))};
    active.onerror=()=>reject(Error("Analysis worker unavailable"));
    active.postMessage(input);
   });
  }catch{/* Bounded synchronous fallback if Worker is unavailable. */}
  finally{if(timer!==undefined)clearTimeout(timer);worker?.terminate()}
 }
 return analyseGuardPixels(input);
}
