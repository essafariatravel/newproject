/** Prepared only. Running this issuer is a separately authorized Production write. */
import "./lib/load-env";
import {readFileSync} from "node:fs";
import {writeFile} from "node:fs/promises";
import {randomBytes,publicEncrypt,constants,createPublicKey} from "node:crypto";
import {Pool} from "pg";
import {guardedProductionPoolConfig} from "./prod-release";
import {digest,assertCleanReleaseCheckout} from "./lib/release-safeguards";
import {privateArtifactPath} from "./lib/dr-private-path";
import {encryptMfaSecret} from "../src/lib/mfa-crypto";
import {issueFirstMfaAuthorization,validateMfaActivationApproval} from "./lib/mfa-production-bootstrap";
import {recipientFingerprint} from "./lib/key-custody";

async function main(){
 if(process.env.MFA_PRODUCTION_ACTIVATION!=="OWNER_AUTHORIZED"||process.env.DATABASE_SCHEMA!=="visa_os")throw new Error("Production MFA activation is not authorized.");
 const file=privateArtifactPath(process.env.MFA_ACTIVATION_APPROVAL_FILE??"","MFA approval",{requireAbsolute:true});
 const raw=readFileSync(file);
 if(digest(raw)!==process.env.MFA_ACTIVATION_APPROVAL_SHA256)throw new Error("MFA approval digest mismatch.");
 const approval=validateMfaActivationApproval(JSON.parse(raw.toString("utf8")),process.env.MFA_ACTIVATION_CANDIDATE_SHA??"");
 assertCleanReleaseCheckout(approval.candidateSha);
 const poolConfig=guardedProductionPoolConfig();
 // Validate the canonical 32-byte key without publishing or storing a factor.
 encryptMfaSecret("configuration-validation-only",approval.userId);
 const output=privateArtifactPath(process.env.MFA_BOOTSTRAP_SEALED_FILE??"","Sealed MFA code",{requireAbsolute:true});
 const recipient=createPublicKey(readFileSync(privateArtifactPath(process.env.MFA_BOOTSTRAP_RECIPIENT_FILE??"","MFA recipient",{requireAbsolute:true})));
 if(recipient.asymmetricKeyType!=="rsa"||(recipient.asymmetricKeyDetails?.modulusLength??0)<3072)throw new Error("An owner-controlled RSA-3072+ delivery recipient is required.");
 if(recipientFingerprint(recipient)!==approval.recipientSha256)throw new Error("MFA recipient does not match the exact owner approval.");
 const code=randomBytes(16).toString("hex");
 const sealed=publicEncrypt({key:recipient,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:"sha256"},Buffer.from(code));
 const pool=new Pool({...poolConfig,max:1});
 try{
  await issueFirstMfaAuthorization(pool,"visa_os",approval.userId,code,approval.approvedBy,async()=>{await writeFile(output,sealed,{mode:0o600,flag:"wx"});});
  console.log("PASS first administrator enrollment authorization issued; sealed code delivered privately, expires in 30 minutes. Enrollment is not yet completed.");
 }finally{await pool.end();}
}
if(/mfa-authorize-production\.(ts|js)$/.test(process.argv[1]??""))main().catch(()=>{console.error("MFA activation refused or failed; no successful enrollment is claimed. A sealed output from a failed attempt is invalid.");process.exitCode=1;});
