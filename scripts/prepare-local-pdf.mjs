/** Pinned Mozilla release, Preview only, no install hooks. */
import {createHash} from "node:crypto";
import {mkdtemp,mkdir,writeFile,rm} from "node:fs/promises";
import {join,dirname} from "node:path";
import {tmpdir} from "node:os";
import {spawnSync} from "node:child_process";
const branch="codex/phase2c-document-intelligence-20261126";
if(process.env.VERCEL!=="1"||process.env.VERCEL_ENV!=="preview"||process.env.VERCEL_GIT_COMMIT_REF!==branch)throw Error("Preview-only PDF assets");
const root=join(process.cwd(),"public","document-guard","pdf-v1"),temp=await mkdtemp(join(tmpdir(),"essafaria-pdf-"));
const url="https://github.com/mozilla/pdf.js/releases/download/v6.5.438/pdfjs-6.5.438-legacy-dist.zip";
try{
 const response=await fetch(url,{signal:AbortSignal.timeout(45000)});
 if(!response.ok||!response.body)throw Error("PDF release unavailable");
 const chunks=[];let size=0;
 for await(const chunk of response.body){size+=chunk.length;if(size>6911254)throw Error("PDF release size mismatch");chunks.push(chunk)}
 const bytes=Buffer.concat(chunks);
 if(size!==6911254||createHash("sha256").update(bytes).digest("hex")!=="55138aa33b5f1f6f68809895338b947f395f344eb6381d424b2420d6daa6a844")throw Error("PDF release integrity mismatch");
 const archive=join(temp,"release.zip");await writeFile(archive,bytes);
 const listing=spawnSync("unzip",["-Z1",archive],{encoding:"utf8",maxBuffer:1000000,timeout:15000});
 if(listing.status!==0)throw Error("Cannot list PDF release");
 const members=listing.stdout.split(/\r?\n/).filter(x=>/^(build\/pdf(?:\.worker)?\.mjs|LICENSE|(?:web\/)?(?:cmaps|standard_fonts|wasm)\/[A-Za-z0-9_.-]+)$/.test(x));
 for(const needed of ["build/pdf.mjs","build/pdf.worker.mjs","LICENSE"])if(!members.includes(needed))throw Error("Missing "+needed);
 await rm(root,{recursive:true,force:true});await mkdir(root,{recursive:true});
 let extracted=0;
 for(const file of members){
  const r=spawnSync("unzip",["-p",archive,file],{maxBuffer:12000000,timeout:15000});
  if(r.status!==0||!r.stdout?.length)throw Error("PDF member missing");
  extracted+=r.stdout.length;if(extracted>35000000)throw Error("PDF asset budget exceeded");
  const dest=join(root,file.replace(/^web\//,""));await mkdir(dirname(dest),{recursive:true});await writeFile(dest,r.stdout);
 }
 await writeFile(join(root,"bridge.mjs"),"import * as api from './build/pdf.mjs';\nwindow.__essafariaPdfGuard=api;\n");
 console.log("[guard] PDF.js 6.5.438 pinned release verified, "+members.length+" local assets");
}catch(error){await rm(root,{recursive:true,force:true});throw error}finally{await rm(temp,{recursive:true,force:true})}
