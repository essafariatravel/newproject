/** Transpile the exact pure analysis module into a same-origin Worker. */
import {mkdir,writeFile,readFile,rm} from "node:fs/promises";
import {join} from "node:path";
import ts from "typescript";
import assert from "node:assert/strict";
import {pathToFileURL} from "node:url";
import {Worker} from "node:worker_threads";
const branch="codex/phase2c-document-intelligence-20261126";
if(process.env.VERCEL!=="1"||!(process.env.VERCEL_ENV==="preview"||process.env.VERCEL_ENV==="production"&&process.env.DATABASE_SCHEMA==="visa_os")||process.env.VERCEL_GIT_COMMIT_REF!==branch)throw Error("Preview-only worker assets");
const root=join(process.cwd(),"public","document-guard","analysis-v1");
await rm(root,{recursive:true,force:true});await mkdir(root,{recursive:true});
const source=await readFile(join(process.cwd(),"src","lib","document-intelligence.ts"),"utf8");
const out=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022},reportDiagnostics:true});
if(out.diagnostics?.some(d=>d.category===ts.DiagnosticCategory.Error))throw Error("Analysis worker transpilation failed");
await writeFile(join(root,"core.mjs"),out.outputText);
const handler="import {analyseGuardPixels} from './core.mjs';\nself.onmessage=({data})=>{try{self.postMessage({ok:true,result:analyseGuardPixels(data)})}catch{self.postMessage({ok:false})}};\n";
await writeFile(join(root,"worker.mjs"),handler);
const moduleUrl=pathToFileURL(join(root,"worker.mjs")).href;
const harness="const {parentPort}=require('node:worker_threads');globalThis.self={postMessage:v=>parentPort.postMessage(v)};import("+JSON.stringify(moduleUrl)+").then(()=>{parentPort.on('message',data=>self.onmessage({data}))}).catch(e=>{throw e})";
const worker=new Worker(harness,{eval:true});
let timer;
try{
 const result=await new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error("Worker qualification timeout")),8000);worker.once("error",reject);worker.once("message",resolve);worker.postMessage({pixels:new Uint8ClampedArray(64*64*4).fill(255),w:64,h:64,originalWidth:640,originalHeight:640,fingerprint:"0".repeat(64),faces:[]})});
 assert.equal(result.ok,true);assert.equal(result.result.signals.width,640);assert.ok(result.result.signals.contrast<.001);assert.equal(result.result.layout.textRows,0);
 console.log("[guard] Exact analysis worker synthetic execution PASS");
}finally{clearTimeout(timer);await worker.terminate()}
