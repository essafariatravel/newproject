import {generateKeyPairSync,createPublicKey,createHash} from "node:crypto";
import {describe,expect,it} from "vitest";
import {spawnSync} from "node:child_process";
import {sealKeyCustody,openKeyCustody,recipientFingerprint} from "../scripts/lib/key-custody";
describe("portable independent key custody",()=>{
 it("recovers in a new recipient context without Windows DPAPI",()=>{
  const owner=generateKeyPairSync("rsa",{modulusLength:3072});
  const keys=Buffer.from(JSON.stringify({recipientPrivateKey:"synthetic test only",backupKey:"test only"}));
  const packageValue=sealKeyCustody(keys,owner.publicKey,recipientFingerprint(owner.publicKey));
  expect(openKeyCustody(packageValue,owner.privateKey)).toEqual(keys);
  expect(JSON.stringify(packageValue)).not.toContain("synthetic test only");
  const child=spawnSync(process.execPath,["--import","tsx","--input-type=module","-e","import {createPrivateKey,createHash} from 'node:crypto'; import {openKeyCustody} from './scripts/lib/key-custody.ts'; let input=''; for await(const c of process.stdin)input+=c; const v=JSON.parse(input); const opened=openKeyCustody(v.package,createPrivateKey(v.key)); console.log(createHash('sha256').update(opened).digest('hex')); opened.fill(0);"],{input:JSON.stringify({package:packageValue,key:owner.privateKey.export({type:"pkcs8",format:"pem"})}),encoding:"utf8",shell:false,windowsHide:true});
  expect(child.status).toBe(0);
  expect(child.stdout.trim()).toBe(createHash("sha256").update(keys).digest("hex"));
 });
 it("rejects wrong owner fingerprint, a swapped key, and tampering",()=>{
  const owner=generateKeyPairSync("rsa",{modulusLength:3072}),other=generateKeyPairSync("rsa",{modulusLength:3072});
  expect(()=>sealKeyCustody(Buffer.from("test"),owner.publicKey,recipientFingerprint(other.publicKey))).toThrow();
  const sealed=sealKeyCustody(Buffer.from("test"),owner.publicKey,recipientFingerprint(owner.publicKey));
  expect(()=>openKeyCustody(sealed,other.privateKey)).toThrow();
  expect(()=>openKeyCustody({...sealed,iv:Buffer.alloc(12).toString("base64")},owner.privateKey)).toThrow();
 });
 it("refuses short or non-RSA custody recipients",()=>{
  const short=generateKeyPairSync("rsa",{modulusLength:2048}).publicKey;
  expect(()=>sealKeyCustody(Buffer.from("test"),short,recipientFingerprint(short))).toThrow();
  const ec=generateKeyPairSync("ec",{namedCurve:"prime256v1"}).publicKey;
  expect(()=>sealKeyCustody(Buffer.from("test"),createPublicKey(ec.export({type:"spki",format:"pem"})),recipientFingerprint(ec))).toThrow();
 });
});
