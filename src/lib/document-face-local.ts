"use client";
import type {FaceBox} from "./document-intelligence";
type Detection={box:{x:number;y:number;width:number;height:number}};
type FaceApi={tf:{setBackend:(name:string)=>Promise<boolean>;ready:()=>Promise<void>};nets:{tinyFaceDetector:{loadFromUri:(url:string)=>Promise<void>}};TinyFaceDetectorOptions:new(o:{inputSize:number;scoreThreshold:number})=>unknown;detectAllFaces:(c:HTMLCanvasElement,o:unknown)=>PromiseLike<Detection[]>};
const ROOT="/document-guard/face-v1";
let loading:Promise<FaceApi>|undefined;
let queue:Promise<unknown>=Promise.resolve();
function api():Promise<FaceApi>{
 if(loading)return loading;
 loading=new Promise<FaceApi>((resolve,reject)=>{
  const script=document.createElement("script");script.type="module";script.src=ROOT+"/bridge.mjs";
  const timer=setTimeout(()=>{script.remove();reject(Error("Face detector unavailable"))},12000);
  script.onerror=()=>{clearTimeout(timer);script.remove();reject(Error("Face detector unavailable"))};
  script.onload=()=>{clearTimeout(timer);const value=(window as unknown as {__essafariaFaceDetector?:FaceApi}).__essafariaFaceDetector;if(value)resolve(value);else reject(Error("Face detector unavailable"))};
  document.head.appendChild(script);
 }).then(async value=>{
  // No biometric identity, age, emotion or landmark models are loaded.
  if(!await value.tf.setBackend("cpu"))throw Error("CPU backend unavailable");
  await value.tf.ready();
  await value.nets.tinyFaceDetector.loadFromUri(ROOT);
  return value;
 }).catch(error=>{loading=undefined;throw error});
 return loading;
}
export async function localFaces(canvas:HTMLCanvasElement):Promise<FaceBox[]|null>{
 const width=canvas.width,height=canvas.height;
 const task=queue.then(async()=>{const model=await api();const found=await model.detectAllFaces(canvas,new model.TinyFaceDetectorOptions({inputSize:320,scoreThreshold:.6}));return found.map(({box:b})=>({x:b.x/width,y:b.y/height,width:b.width/width,height:b.height/height}))});
 queue=task.catch(()=>{});
 // Don't cancel or release the source canvas while inference is executing.
 try{return await task}catch{return null}
}
