/** Real key material is accepted only on private stdin, never arguments or logs. */
import {createPublicKey,createPrivateKey} from "node:crypto";
import {readFileSync,writeFileSync} from "node:fs";
import {privateArtifactPath} from "./lib/dr-private-path";
import {recipientFingerprint,sealKeyCustody} from "./lib/key-custody";
async function main(){
 if(process.env.DR_KEY_CUSTODY_AUTHORIZATION!=="OWNER_DESIGNATED_RECIPIENT")throw new Error("Independent custody recipient is not authorized.");
 const publicKey=createPublicKey(readFileSync(privateArtifactPath(process.env.DR_CUSTODY_RECIPIENT_FILE??"","Custody recipient",{requireAbsolute:true})));
 const output=privateArtifactPath(process.env.DR_CUSTODY_OUTPUT_FILE??"","Sealed custody package",{requireAbsolute:true});
 let data="";
 for await(const chunk of process.stdin){data+=chunk.toString();if(data.length>32768)throw new Error("Custody payload exceeds permitted size.");}
 const secrets=JSON.parse(data);
 const aes=Buffer.from(secrets.aes??"","base64");
 const originalRecipient=createPrivateKey(secrets.recipient??"");
 if(aes.length!==32||aes.toString("base64")!==secrets.aes||recipientFingerprint(originalRecipient)!=="f82fa8d7fc09b01a2487a02a6d36d3937c3ade3d6ff0a84c205882bbdb526044")throw new Error("Original authenticated recovery key material is invalid.");
 if(secrets.mfa){const mfa=Buffer.from(secrets.mfa,"base64");if(mfa.length!==32||mfa.toString("base64")!==secrets.mfa)throw new Error("MFA key format is invalid.");mfa.fill(0);}
 const input=Buffer.from(data);
 try{writeFileSync(output,JSON.stringify(sealKeyCustody(input,publicKey,process.env.DR_CUSTODY_RECIPIENT_SHA256??"")),{flag:"wx",mode:0o600});}
 finally{input.fill(0);aes.fill(0);data="";}
 console.log("PASS recovery keys sealed to the explicitly designated independent custodian. Receipt and recovery confirmation remain required.");
}
main().catch(()=>{console.error("Independent key custody export refused or failed; secrets omitted.");process.exitCode=1;});
