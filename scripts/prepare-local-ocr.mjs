/**
 * Preview-only OCR distribution. Fixed upstream npm archive versions + SHA-512
 * pins, no install hooks, no runtime CDN, no access to database or secrets.
 * Extract individual allowlisted members only (never unpack paths to disk).
 */
import {createHash} from "node:crypto";
import {mkdtemp,mkdir,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
const branch="codex/phase2c-document-intelligence-20261126";
if(process.env.VERCEL!=="1"||process.env.VERCEL_ENV!=="preview"||process.env.VERCEL_GIT_COMMIT_REF!==branch)throw Error("OCR asset preparation is restricted to Phase II-C Preview");
const root=join(process.cwd(),"public","ocr","phase2c-v1");
const archives=[
 {name:"tesseract.js@6.0.1",url:"https://registry.npmjs.org/tesseract.js/-/tesseract.js-6.0.1.tgz",integrity:"/sPvMvrCtgxnNRCjbTYbr7BRu0yfWDsMZQ2a/T5aN/L1t8wUQN6tTWv6p6FwzpoEBA0jrN2UD2SX4QQFRdoDbA==",members:{"dist/tesseract.min.js":"tesseract.min.js","dist/worker.min.js":"worker.min.js","LICENSE.md":"tesseract-license.txt"}},
 {name:"tesseract.js-core@6.1.2",url:"https://registry.npmjs.org/tesseract.js-core/-/tesseract.js-core-6.1.2.tgz",integrity:"pv4GjmramjdObhDyR1q85Td8X60Puu/lGQn7Kw2id05LLgHhAcWgnz6xSdMCSxBMWjQDmMyDXPTC2aqADdpiow==",members:{"tesseract-core-lstm.wasm.js":"tesseract-core-lstm.wasm.js","tesseract-core-simd-lstm.wasm.js":"tesseract-core-simd-lstm.wasm.js","tesseract-core-lstm.wasm":"tesseract-core-lstm.wasm","tesseract-core-simd-lstm.wasm":"tesseract-core-simd-lstm.wasm","LICENSE":"core-license.txt"}},
 {name:"@tesseract.js-data/eng@1.0.0",url:"https://registry.npmjs.org/@tesseract.js-data/eng/-/eng-1.0.0.tgz",integrity:"mbTumm6KQPUHyzTPQaF3ObXYnx0SqqfV2nabqFVQBwD6Kl7PhGSLSzOlfFTWy0P3BjghaSKA2W9GB19Jk+ZcTg==",members:{"4.0.0_best_int/eng.traineddata.gz":"eng.traineddata.gz"}}
];
const temp=await mkdtemp(join(tmpdir(),"essafaria-ocr-"));
try{
 await rm(root,{recursive:true,force:true});await mkdir(root,{recursive:true});
 const manifest=[];
 for(const [i,item] of archives.entries()){
  const res=await fetch(item.url,{redirect:"error",signal:AbortSignal.timeout(60000)});
  if(!res.ok||!res.body)throw Error("OCR archive unavailable: "+item.name);
  const chunks=[];let size=0;
  for await(const chunk of res.body){size+=chunk.length;if(size>80*1024*1024)throw Error("OCR archive size limit");chunks.push(chunk)}
  const bytes=Buffer.concat(chunks);
  if(createHash("sha512").update(bytes).digest("base64")!==item.integrity)throw Error("OCR archive integrity mismatch: "+item.name);
  const archive=join(temp,"archive-"+i+".tgz");await writeFile(archive,bytes);
  for(const [source,dest] of Object.entries(item.members)){
   const result=spawnSync("tar",["-xOzf",archive,"package/"+source],{maxBuffer:40*1024*1024,timeout:30000});
   if(result.status!==0||!result.stdout?.length)throw Error("Required OCR asset missing: "+dest);
   await writeFile(join(root,dest),result.stdout);
   manifest.push({file:dest,bytes:result.stdout.length,sha256:createHash("sha256").update(result.stdout).digest("hex")});
  }
  console.log("[ocr] Verified pinned archive "+item.name);
 }
 await writeFile(join(root,"NOTICE.txt"),"Tesseract.js 6.0.1 and tesseract.js-core 6.1.2 (Apache-2.0). English language assets @tesseract.js-data/eng 1.0.0 (MIT package; model from Tesseract tessdata). Sources: https://github.com/naptha/tesseract.js and https://github.com/naptha/tessdata. No document data sent to these sources.\n");
 await writeFile(join(root,"manifest.json"),JSON.stringify({version:"phase2c-v1",files:manifest},null,2)+"\n");
 console.log("[ocr] Local WASM assets prepared and verified");
}catch(error){await rm(root,{recursive:true,force:true});throw error}finally{await rm(temp,{recursive:true,force:true})}
