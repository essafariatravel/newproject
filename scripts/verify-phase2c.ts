/** Preview qualification: synthetic fixture only; no database or client files. */
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {gunzipSync} from "node:zlib";
import {createHash} from "node:crypto";
import {readTd3,uniqueVerifiedOcr,passportValidity,expiryMatchesMrz,photoRatioDifference,duplicateGroups,imageSignals} from "../src/lib/document-intelligence";
import {FULL_QUAD,validQuad,projectiveMap,rectifiedSize,rectifyPixels} from "../src/lib/document-geometry";
const specimen="P<DZABENABDALLAH<<MOHAMED<AMINE<ABDELKADER<<\nA123456784DZA9203181M32041531234567890123456";
async function main(){
 assert.equal(readTd3(specimen)?.checksPassed,true);
 assert.equal(uniqueVerifiedOcr([specimen.replace("A12345678","B12345678")]),null);
 assert.equal(uniqueVerifiedOcr([specimen,specimen.replace("BENABDALLAH","BENABDALAHH")]),null);
 assert.equal(passportValidity("2032-04-15","2032-04-01"),14);
 assert.equal(expiryMatchesMrz("2032-04-15","320415"),true);
 assert.equal(expiryMatchesMrz("2032-04-16","320415"),false);
 assert.equal(photoRatioDifference(350,450,35,45),0);
 assert.equal(photoRatioDifference(350,450,0,45),null);
 assert.deepEqual(duplicateGroups([{item:1,hash:"a"},{item:2,hash:"a"},{item:3,hash:"b"}]),[[1,2]]);
 assert.ok(imageSignals(new Uint8ClampedArray(100).fill(255),5,5).contrast<.001);
 assert.deepEqual(projectiveMap(FULL_QUAD)(.3,.7),{x:.3,y:.7});
 assert.deepEqual(rectifiedSize(FULL_QUAD,4000,2000),{width:2000,height:1000});
 assert.equal(validQuad([FULL_QUAD[0],FULL_QUAD[2],FULL_QUAD[1],FULL_QUAD[3]]),false);
 const pixels=new Uint8ClampedArray([255,0,0,255,0,255,0,255,0,0,255,255,255,255,255,255]);
 assert.deepEqual(rectifyPixels(pixels,2,2,FULL_QUAD,2,2),pixels);
 console.log("[phase2c] Deterministic MRZ, expiry, photo, duplicate, geometry checks PASS");
 const fixture=readFileSync(join(process.cwd(),"tests/fixtures/phase2c-synthetic-mrz.png"));
 assert.equal(createHash("sha256").update(fixture).digest("hex"),"cabbec220bcbedb7c78aa683106ce719c9fb528674ec9826335e0a32c4e57e66");
 const root=join(process.cwd(),"public","ocr","phase2c-v1");
 const require=createRequire(join(process.cwd(),"package.json"));
 const factory=require(join(root,"tesseract-core-lstm.wasm.js"));
 const core=await factory({TesseractProgress:()=>{},locateFile:(name:string)=>join(root,name)});
 core.FS.writeFile("eng.traineddata",gunzipSync(readFileSync(join(root,"eng.traineddata.gz"))));
 const api=new core.TessBaseAPI();
 try{
  assert.equal(api.Init(null,"eng",1,null),0);
  api.SetVariable("tessedit_char_whitelist","ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<");
  api.SetVariable("tessedit_pageseg_mode","6");
  core.FS.writeFile("/input",fixture);
  assert.notEqual(api.SetImageFile(1,0),1);
  api.Recognize(null);
  assert.equal(uniqueVerifiedOcr([api.GetUTF8Text()]),specimen,"WASM did not recover the exact synthetic MRZ");
  console.log("[phase2c] Actual WASM OCR synthetic image recognition PASS");
 }finally{api.End?.();api.delete?.()}
}
main().catch(error=>{console.error("[phase2c] Qualification failed:",error instanceof Error?error.message:"Unknown failure");process.exitCode=1});
