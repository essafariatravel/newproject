import {randomBytes,publicEncrypt,constants} from "node:crypto";
import {mkdtemp,readFile,writeFile} from "node:fs/promises";
import os from "node:os";
import {spawnSync} from "node:child_process";
import path from "node:path";
import {encryptFileAes256Gcm} from "./lib/dr-backup";

async function main(){
  const dir=await mkdtemp(path.join(process.env.RUNNER_TEMP||os.tmpdir(),"essafaria-readonly-dr-backup-"));
  const key=randomBytes(32);
  const env={...process.env,DATABASE_URL:process.env.PRODUCTION_DATABASE_URL,DATABASE_SCHEMA:"visa_os",DR_BACKUP_ENVIRONMENT:"PRODUCTION",DR_STORAGE_MODE:"DATABASE_BLOBS",DR_RELEASE_SHA:process.env.DR_SOURCE_RELEASE_SHA,DR_BACKUP_KEY_BASE64:key.toString("base64"),PGOPTIONS:"-c default_transaction_read_only=on"};
  const wrapped=publicEncrypt({key:await readFile("docs/consolidation/dr-backup-recipient.public-key.txt"),oaepHash:"sha256",padding:constants.RSA_PKCS1_OAEP_PADDING},key);
  await writeFile(path.join(dir,"wrapped-backup-key.bin"),wrapped,{mode:0o600});
  const preflight=spawnSync(process.execPath,["--import","tsx","scripts/dr-prod-preflight.ts"],{env,shell:false,encoding:"utf8"});
  // Invariant counts only; the preflight never prints private rows or credentials.
  await writeFile(path.join(dir,"preflight.json"),preflight.stdout||"{}",{mode:0o600});
  await encryptFileAes256Gcm(path.join(dir,"preflight.json"),path.join(dir,"preflight.json.enc"),key);
  if(preflight.status!==0)throw new Error("Read-only DR preflight rejected the source. Production was not changed; no backup or restore was claimed.");
  const backup=spawnSync(process.execPath,["--import","tsx","scripts/dr-create-backup.ts","--output-dir",dir],{env,shell:false,encoding:"utf8"});
  if(backup.status!==0)throw new Error("Read-only encrypted backup failed. Production was not changed.");
  console.log("PASS read-only Production backup created and encrypted; restore remains unverified.");
}
main().catch(error=>{console.error(error instanceof Error?error.message:"Read-only backup failed.");process.exitCode=1;});
