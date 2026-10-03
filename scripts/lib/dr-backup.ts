import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { open, rm, stat } from "node:fs/promises";
import { Writable } from "node:stream";
import { targetsSupabaseProject } from "../../src/lib/database-config";
import { PRODUCTION_PROJECT_REF, PRODUCTION_SCHEMA } from "./dr-safety";

const MAGIC = Buffer.from("ESSAFARIA-DR1\0", "utf8");
const IV_BYTES = 12;
const TAG_BYTES = 16;

export interface BackupSourceAssessment {
  safe: boolean;
  findings: string[];
  databaseUrl: string | null;
}

export function assessProductionBackupSource(env: Record<string, string | undefined>): BackupSourceAssessment {
  const findings: string[] = [];
  if (env.DR_BACKUP_ENVIRONMENT !== "PRODUCTION") findings.push("DR_BACKUP_ENVIRONMENT must equal PRODUCTION");
  if (env.DATABASE_SCHEMA !== PRODUCTION_SCHEMA) findings.push(`DATABASE_SCHEMA must equal ${PRODUCTION_SCHEMA}`);
  if (env.VERCEL) findings.push("Production backups must not run inside a Vercel runtime");
  if (env.DR_STORAGE_MODE !== "DATABASE_BLOBS") {
    findings.push("DR_STORAGE_MODE must explicitly equal DATABASE_BLOBS; external-object backup requires a separate object export");
  }
  if (!env.DR_RELEASE_SHA || !/^[0-9a-f]{7,40}$/i.test(env.DR_RELEASE_SHA)) {
    findings.push("DR_RELEASE_SHA must explicitly identify the source release");
  }

  const databaseUrl = env.MIGRATION_DATABASE_URL || env.DATABASE_URL || null;
  if (!databaseUrl) {
    findings.push("MIGRATION_DATABASE_URL or DATABASE_URL must be supplied explicitly");
    return { safe: false, findings, databaseUrl: null };
  }
  try {
    if (!targetsSupabaseProject(databaseUrl, PRODUCTION_PROJECT_REF)) {
      findings.push("database URL does not target the approved ESSAFARIA Supabase project");
    }
  } catch {
    findings.push("database URL is not a valid PostgreSQL URI");
  }
  return { safe: findings.length === 0, findings, databaseUrl };
}

export function backupKeyFromEnvironment(value: string | undefined): Buffer {
  if (!value) throw new Error("DR_BACKUP_KEY_BASE64 is required.");
  let key: Buffer;
  try {
    key = Buffer.from(value, "base64");
  } catch {
    throw new Error("DR_BACKUP_KEY_BASE64 must be valid base64.");
  }
  if (key.length !== 32) throw new Error("DR_BACKUP_KEY_BASE64 must decode to exactly 32 bytes.");
  if (key.every((byte) => byte === 0)) throw new Error("DR_BACKUP_KEY_BASE64 cannot be an all-zero key.");
  return key;
}

export function pgEnvironmentFromUrl(raw: string, base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const url = new URL(raw);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("Database URL must be PostgreSQL.");
  const database = url.pathname.replace(/^\//, "");
  if (!url.hostname || !database || !url.username) throw new Error("Database URL is incomplete.");
  const env: NodeJS.ProcessEnv = { ...base };
  env.PGHOST = url.hostname;
  env.PGPORT = url.port || "5432";
  env.PGDATABASE = decodeURIComponent(database);
  env.PGUSER = decodeURIComponent(url.username);
  if (url.password) env.PGPASSWORD = decodeURIComponent(url.password);
  const sslmode = url.searchParams.get("sslmode");
  if (sslmode) env.PGSSLMODE = sslmode;
  else if (url.hostname.endsWith(".supabase.co") || url.hostname.endsWith(".pooler.supabase.com")) env.PGSSLMODE = "require";
  delete env.DATABASE_URL;
  delete env.MIGRATION_DATABASE_URL;
  delete env.DR_BACKUP_KEY_BASE64;
  return env;
}

export async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.once("error", reject);
    stream.once("end", resolve);
  });
  return hash.digest("hex");
}

export function storageInventorySha256(rows: readonly { key: string; sizeBytes: number }[]): string {
  const hash = createHash("sha256");
  for (const row of [...rows].sort((a, b) => a.key.localeCompare(b.key))) {
    hash.update(row.key);
    hash.update("\0");
    hash.update(String(row.sizeBytes));
    hash.update("\n");
  }
  return hash.digest("hex");
}

export async function encryptFileAes256Gcm(sourcePath: string, destinationPath: string, key: Buffer): Promise<void> {
  if (key.length !== 32) throw new Error("AES-256-GCM requires a 32-byte key.");
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  await new Promise<void>((resolve, reject) => {
    const input = createReadStream(sourcePath);
    const output = createWriteStream(destinationPath, { flags: "wx", mode: 0o600 });
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      input.destroy();
      cipher.destroy();
      output.destroy();
      reject(error);
    };
    input.once("error", fail);
    cipher.once("error", fail);
    output.once("error", fail);
    output.write(MAGIC);
    output.write(iv);
    input.pipe(cipher).pipe(output, { end: false });
    cipher.once("end", () => {
      try {
        output.end(cipher.getAuthTag());
      } catch (error) {
        fail(error instanceof Error ? error : new Error("Backup encryption failed."));
      }
    });
    output.once("close", () => {
      if (settled) return;
      settled = true;
      resolve();
    });
  });
}

export async function verifyEncryptedFileAes256Gcm(path: string, key: Buffer): Promise<void> {
  if (key.length !== 32) throw new Error("AES-256-GCM requires a 32-byte key.");
  const metadata = await stat(path);
  const minimum = MAGIC.length + IV_BYTES + TAG_BYTES + 1;
  if (metadata.size < minimum) throw new Error("Encrypted backup is too small.");

  const handle = await open(path, "r");
  const prefix = Buffer.alloc(MAGIC.length + IV_BYTES);
  const tag = Buffer.alloc(TAG_BYTES);
  try {
    await handle.read(prefix, 0, prefix.length, 0);
    await handle.read(tag, 0, TAG_BYTES, metadata.size - TAG_BYTES);
  } finally {
    await handle.close();
  }
  if (!prefix.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("Encrypted backup has an invalid header.");
  const iv = prefix.subarray(MAGIC.length);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const sink = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
  await new Promise<void>((resolve, reject) => {
    const input = createReadStream(path, {
      start: MAGIC.length + IV_BYTES,
      end: metadata.size - TAG_BYTES - 1,
    });
    input.once("error", reject);
    decipher.once("error", reject);
    sink.once("error", reject);
    sink.once("finish", resolve);
    input.pipe(decipher).pipe(sink);
  });
}

export async function decryptFileAes256Gcm(sourcePath: string, destinationPath: string, key: Buffer): Promise<void> {
  if (key.length !== 32) throw new Error("AES-256-GCM requires a 32-byte key.");
  const metadata = await stat(sourcePath);
  const minimum = MAGIC.length + IV_BYTES + TAG_BYTES + 1;
  if (metadata.size < minimum) throw new Error("Encrypted backup is too small.");

  const handle = await open(sourcePath, "r");
  const prefix = Buffer.alloc(MAGIC.length + IV_BYTES);
  const tag = Buffer.alloc(TAG_BYTES);
  try {
    await handle.read(prefix, 0, prefix.length, 0);
    await handle.read(tag, 0, TAG_BYTES, metadata.size - TAG_BYTES);
  } finally {
    await handle.close();
  }
  if (!prefix.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("Encrypted backup has an invalid header.");

  const iv = prefix.subarray(MAGIC.length);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  try {
    await new Promise<void>((resolve, reject) => {
      const input = createReadStream(sourcePath, {
        start: MAGIC.length + IV_BYTES,
        end: metadata.size - TAG_BYTES - 1,
      });
      const output = createWriteStream(destinationPath, { flags: "wx", mode: 0o600 });
      input.once("error", reject);
      decipher.once("error", reject);
      output.once("error", reject);
      output.once("close", resolve);
      input.pipe(decipher).pipe(output);
    });
  } catch (error) {
    await rm(destinationPath, { force: true }).catch(() => {});
    throw error;
  }
}

export function encryptedBackupOverheadBytes(): number {
  return MAGIC.length + IV_BYTES + TAG_BYTES;
}
