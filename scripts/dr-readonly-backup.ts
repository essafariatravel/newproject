import {randomBytes,publicEncrypt,constants} from "node:crypto";
import {mkdtemp,readFile,writeFile} from "node:fs/promises";
import os from "node:os";
import {spawnSync} from "node:child_process";
import path from "node:path";
import {encryptFileAes256Gcm} from "./lib/dr-backup";

async function main(){
  const dir=await mkdtemp(path.join(process.env.RUNNER_TEMP||os.tmpdir(),"essafaria-readonly-dr-backup-"));
  const key=randomBytes(32);
  let sourceUrl = process.env.PRODUCTION_DATABASE_URL;
  if (process.env.DR_USE_SESSION_POOLER === "YES") {
    const url = new URL(sourceUrl || "");
    if (!url.hostname.endsWith(".pooler.supabase.com") || !url.username.endsWith(".xgetzgixalrsmuvfthpf")) throw new Error("Shared source connection does not target the approved project.");
    if (url.port === "6543") url.port = "5432";
    sourceUrl = url.href;
  }
  const env={...process.env,DATABASE_URL:sourceUrl,MIGRATION_DATABASE_URL:sourceUrl,DATABASE_SCHEMA:"visa_os",DR_BACKUP_ENVIRONMENT:"PRODUCTION",DR_STORAGE_MODE:"DATABASE_BLOBS",DR_RELEASE_SHA:process.env.DR_SOURCE_RELEASE_SHA,DR_BACKUP_KEY_BASE64:key.toString("base64"),PGOPTIONS:"-c default_transaction_read_only=on"};
  const wrapped=publicEncrypt({key:await readFile("docs/consolidation/dr-backup-recipient.public-key.txt"),oaepHash:"sha256",padding:constants.RSA_PKCS1_OAEP_PADDING},key);
  await writeFile(path.join(dir,"wrapped-backup-key.bin"),wrapped,{mode:0o600});
  const preflight=spawnSync(process.execPath,["--import","tsx","scripts/dr-prod-preflight.ts"],{env,shell:false,encoding:"utf8"});
  // Invariant counts only; the preflight never prints private rows or credentials.
  let report: unknown = null;
  try { report = JSON.parse(preflight.stdout || "null"); } catch { /* Preserve only safe structured evidence. */ }
  const diagnostic = preflight.stderr || "";
  const errorCode = preflight.status === 0 ? null
    : /password authentication failed/i.test(diagnostic) ? "DATABASE_AUTHENTICATION_FAILED"
    : /ENOTFOUND|ENETUNREACH|ECONNREFUSED|timeout|timed out/i.test(diagnostic) ? "DATABASE_CONNECTION_UNAVAILABLE"
    : preflight.error ? "PREFLIGHT_PROCESS_FAILED" : "PREFLIGHT_REJECTED";
  await writeFile(path.join(dir,"preflight.json"),JSON.stringify({report,execution:{exitCode:preflight.status,errorCode}}),{mode:0o600});
  await encryptFileAes256Gcm(path.join(dir,"preflight.json"),path.join(dir,"preflight.json.enc"),key);
  if(preflight.status!==0)throw new Error("Read-only DR preflight rejected the source. Production was not changed; no backup or restore was claimed.");
  const backup=spawnSync(process.execPath,["--import","tsx","scripts/dr-create-backup.ts","--output-dir",dir],{env,shell:false,encoding:"utf8"});
  if(backup.status!==0)throw new Error("Read-only encrypted backup failed. Production was not changed.");
  console.log("PASS read-only Production backup created and encrypted; restore remains unverified.");
}
main().catch(error=>{console.error(error instanceof Error?error.message:"Read-only backup failed.");process.exitCode=1;});
