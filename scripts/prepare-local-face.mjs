/** Build-only, pinned same-origin face-detection assets. No uploads or runtime CDN. */
import {createHash} from "node:crypto";
import {mkdir,rm,writeFile,readFile} from "node:fs/promises";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import assert from "node:assert/strict";
const branch="codex/phase2c-document-intelligence-20261126";
if(process.env.VERCEL!=="1"||process.env.VERCEL_ENV!=="preview"||process.env.VERCEL_GIT_COMMIT_REF!==branch)throw Error("Preview-only face assets");
const root=join(process.cwd(),"public","document-guard","face-v1");
const rev="189226d63aabb48cb40776fd1c453ebc0fa722f1";
const base="https://raw.githubusercontent.com/vladmandic/face-api/"+rev+"/";
const files=[
 ["dist/face-api.esm.js","face-api.mjs","19c28a68492c6a2da43d8c80522fba2615203d2c",1333462],
 ["model/tiny_face_detector_model-weights_manifest.json","tiny_face_detector_model-weights_manifest.json","d11c9a32070222e9838b614c6981334b358423d5",3219],
 ["model/tiny_face_detector_model.bin","tiny_face_detector_model.bin","a3f113a54220f9bda6b5e9a805fa657a13a0cd21",193321],
 ["LICENSE","LICENSE.txt","f62fb36dd8ec3701afcab60abe19d75f374c2ba5",1067]
];
await rm(root,{recursive:true,force:true});await mkdir(root,{recursive:true});
try{
 for(const [source,dest,sha,size] of files){
  const response=await fetch(base+source,{redirect:"error",signal:AbortSignal.timeout(30000)});
  if(!response.ok||!response.body)throw Error("Face asset unavailable: "+dest);
  const chunks=[];let count=0;
  for await(const chunk of response.body){count+=chunk.length;if(count>size)throw Error("Face asset size mismatch: "+dest);chunks.push(chunk)}
  const bytes=Buffer.concat(chunks);
  const actual=createHash("sha1").update("blob "+bytes.length+"\0").update(bytes).digest("hex");
  if(bytes.length!==size||actual!==sha)throw Error("Face asset integrity mismatch: "+dest);
  await writeFile(join(root,dest),bytes);
 }
 await writeFile(join(root,"bridge.mjs"),"import * as api from './face-api.mjs';\nwindow.__essafariaFaceDetector=api;\n");
 await writeFile(join(root,"NOTICE.txt"),"Face-api 1.7.15, MIT, Vladimir Mandic; bundled TensorFlow.js, Apache-2.0. Source revision: "+rev+"\nhttps://github.com/vladmandic/face-api\nOnly TinyFaceDetector used.\n");
 console.log("[guard] Pinned local face detector assets verified");
 // The exact browser bundle selects a browser platform, not its Node shim.
 // This isolated CPU tensor test requires no real canvas or client image.
 const originalProcess=globalThis.process;
 const originals=new Map();
 const set=(key,value)=>{originals.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value})};
 try{
  set("window",globalThis);set("document",{createElement:()=>({getContext:()=>null,style:{}})});
  for(const key of ["HTMLImageElement","HTMLCanvasElement","HTMLVideoElement","ImageData","CanvasRenderingContext2D"])set(key,class {});
  set("process",undefined);
  const api=await import(pathToFileURL(join(root,"face-api.mjs")).href);
 assert.equal(await api.tf.setBackend("cpu"),true);
 await api.tf.ready();
 const manifest=JSON.parse(await readFile(join(root,"tiny_face_detector_model-weights_manifest.json"),"utf8"));
 const weights=await readFile(join(root,"tiny_face_detector_model.bin"));
 const map=api.tf.io.decodeWeights(weights.buffer.slice(weights.byteOffset,weights.byteOffset+weights.byteLength),manifest.flatMap(g=>g.weights));
 api.nets.tinyFaceDetector.loadFromWeightMap(map);
 const blank=api.tf.zeros([160,160,3],"int32");
 try{
  const found=await api.nets.tinyFaceDetector.locateFaces(blank,new api.TinyFaceDetectorOptions({inputSize:160,scoreThreshold:.6}));
  assert.equal(found.length,0,"Blank synthetic image must not produce a face");
  console.log("[guard] CPU model inference on blank synthetic image PASS");
 }finally{blank.dispose();api.nets.tinyFaceDetector.dispose()}
 }finally{for(const [key,descriptor] of [...originals].reverse()){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]} if(globalThis.process!==originalProcess)throw Error("Test environment cleanup failed")}

}catch(error){await rm(root,{recursive:true,force:true});throw error}
