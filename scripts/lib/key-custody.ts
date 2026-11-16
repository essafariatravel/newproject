import {constants,createCipheriv,createDecipheriv,createHash,createPublicKey,privateDecrypt,publicEncrypt,randomBytes,type KeyObject} from "node:crypto";
export interface SealedKeyCustody {version:1;kind:"ESSAFARIA_RECOVERY_KEY_CUSTODY";recipientSha256:string;wrappedKey:string;iv:string;tag:string;ciphertext:string;}
function publicPart(key:KeyObject):KeyObject{return key.type==="public"?key:createPublicKey(key);}
export function recipientFingerprint(key:KeyObject):string{return createHash("sha256").update(publicPart(key).export({type:"spki",format:"der"})).digest("hex");}
export function sealKeyCustody(secret:Buffer,recipient:KeyObject,expectedFingerprint:string):SealedKeyCustody {
 const key=publicPart(recipient),fingerprint=recipientFingerprint(key);
 if(key.asymmetricKeyType!=="rsa"||(key.asymmetricKeyDetails?.modulusLength??0)<3072||fingerprint!==expectedFingerprint)throw new Error("Owner custody recipient identity or strength is invalid.");
 const aes=randomBytes(32),iv=randomBytes(12);
 try{
  const cipher=createCipheriv("aes-256-gcm",aes,iv);
  cipher.setAAD(Buffer.from(`ESSAFARIA_RECOVERY_KEY_CUSTODY:1:${fingerprint}`));
  const ciphertext=Buffer.concat([cipher.update(secret),cipher.final()]);
  const wrapped=publicEncrypt({key,oaepHash:"sha256",padding:constants.RSA_PKCS1_OAEP_PADDING},aes);
  return {version:1,kind:"ESSAFARIA_RECOVERY_KEY_CUSTODY",recipientSha256:fingerprint,wrappedKey:wrapped.toString("base64"),iv:iv.toString("base64"),tag:cipher.getAuthTag().toString("base64"),ciphertext:ciphertext.toString("base64")};
 }finally{aes.fill(0);}
}
export function openKeyCustody(value:SealedKeyCustody,recipient:KeyObject):Buffer {
 if(value.version!==1||value.kind!=="ESSAFARIA_RECOVERY_KEY_CUSTODY"||recipient.type!=="private"||value.recipientSha256!==recipientFingerprint(recipient))throw new Error("Custody package identity is invalid.");
 const aes=privateDecrypt({key:recipient,oaepHash:"sha256",padding:constants.RSA_PKCS1_OAEP_PADDING},Buffer.from(value.wrappedKey,"base64"));
 try{
  const decipher=createDecipheriv("aes-256-gcm",aes,Buffer.from(value.iv,"base64"));
  decipher.setAAD(Buffer.from(`ESSAFARIA_RECOVERY_KEY_CUSTODY:1:${value.recipientSha256}`));
  decipher.setAuthTag(Buffer.from(value.tag,"base64"));
  return Buffer.concat([decipher.update(Buffer.from(value.ciphertext,"base64")),decipher.final()]);
 }finally{aes.fill(0);}
}
