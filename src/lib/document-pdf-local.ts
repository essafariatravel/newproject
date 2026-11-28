"use client";
import {pdfPagePlan,type GuardIssue,type GuardImage} from "./document-intelligence";
const ROOT="/document-guard/pdf-v1";
type Render={promise:Promise<void>;cancel:()=>void};
type Page={getViewport:(o:{scale:number})=>{width:number;height:number};render:(o:Record<string,unknown>)=>Render;cleanup:()=>void};
type Pdf={numPages:number;getPage:(n:number)=>Promise<Page>};
type Load={promise:Promise<Pdf>;destroy:()=>Promise<void>};
type Api={GlobalWorkerOptions:{workerSrc:string};getDocument:(o:Record<string,unknown>)=>Load};
let loading:Promise<Api>|undefined;
function load():Promise<Api>{
 if(loading)return loading;
 loading=new Promise<Api>((resolve,reject)=>{
  const script=document.createElement("script");script.type="module";script.src=ROOT+"/bridge.mjs";
  const timer=setTimeout(()=>{script.remove();reject(Error("PDF engine unavailable"))},10000);
  script.onerror=()=>{clearTimeout(timer);script.remove();reject(Error("PDF engine unavailable"))};
  script.onload=()=>{clearTimeout(timer);const api=(window as unknown as {__essafariaPdfGuard?:Api}).__essafariaPdfGuard;if(api){api.GlobalWorkerOptions.workerSrc=ROOT+"/build/pdf.worker.mjs";resolve(api)}else reject(Error("PDF engine unavailable"))};
  document.head.append(script);
 }).catch(e=>{loading=undefined;throw e});
 return loading;
}
export type PdfReport={total:number;analysed:number;pages:GuardImage[];issues:GuardIssue[]};
let active=false;
export async function inspectPdf(buffer:ArrayBuffer,analyse:(canvas:HTMLCanvasElement)=>Promise<GuardImage>):Promise<PdfReport>{
 const result:PdfReport={total:0,analysed:0,pages:[],issues:[]};
 if(active){result.issues.push("limited");return result}
 active=true;let task:Load|undefined,render:Render|undefined,timer:ReturnType<typeof setTimeout>|undefined,cancelled=false;
 const job=(async()=>{
  try{
   const api=await load();if(cancelled)return;
   const root=new URL(ROOT,location.origin).href;
   task=api.getDocument({data:new Uint8Array(buffer),isEvalSupported:false,enableXfa:false,stopAtErrors:true,disableFontFace:true,useSystemFonts:false,disableRange:true,disableStream:true,disableAutoFetch:true,maxImageSize:16000000,canvasMaxAreaInBytes:32000000,cMapUrl:root+"/cmaps/",cMapPacked:true,standardFontDataUrl:root+"/standard_fonts/",wasmUrl:root+"/wasm/",useWasm:false});
   const pdf=await task.promise;if(cancelled)return;
   result.total=pdf.numPages;
   for(const n of pdfPagePlan(pdf.numPages)){
    if(cancelled)break;
    const page=await pdf.getPage(n);if(cancelled)break;
    const base=page.getViewport({scale:1});
    if(!Number.isFinite(base.width)||!Number.isFinite(base.height)||base.width<=0||base.height<=0)throw Error("Invalid page dimensions");
    const viewport=page.getViewport({scale:Math.min(2,480/Math.max(base.width,base.height))});
    const c=document.createElement("canvas");c.width=Math.max(3,Math.ceil(viewport.width));c.height=Math.max(3,Math.ceil(viewport.height));
    const ctx=c.getContext("2d",{willReadFrequently:true});if(!ctx)throw Error("No canvas");
    try{ctx.fillStyle="#fff";ctx.fillRect(0,0,c.width,c.height);render=page.render({canvas:c,canvasContext:ctx,viewport,annotationMode:0,background:"#ffffff"});await render.promise;render=undefined;if(cancelled)break;
     const sample=await analyse(c);if(cancelled)break;result.pages.push({...sample,isPdfPage:true});result.analysed++;
    }finally{c.width=c.height=0;page.cleanup()}
    await new Promise<void>(resolve=>setTimeout(resolve,0));
   }
  }catch(e){if(!cancelled){const name=e instanceof Error?e.name:"";result.issues.push(name==="PasswordException"?"pdfProtected":name==="InvalidPDFException"?"unreadable":"limited")}}
  finally{try{await task?.destroy()}catch{}active=false}
 })();
 try{await Promise.race([job,new Promise<void>(resolve=>{timer=setTimeout(()=>{cancelled=true;result.issues.push("pdfPartial");try{render?.cancel();void task?.destroy().catch(()=>{})}catch{}resolve()},25000)})])}
 finally{if(timer!==undefined)clearTimeout(timer)}
 return {...result,pages:[...result.pages],issues:[...result.issues]};
}
