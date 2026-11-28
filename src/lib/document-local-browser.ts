"use client";
import {imageSignals,duplicateGroups} from "./document-intelligence";
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
