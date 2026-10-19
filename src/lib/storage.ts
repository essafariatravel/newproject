/**
 * Document storage abstraction.
 *
 * Providers:
 *  - "db"       (default): documents stored as bytea in PostgreSQL. Works on any
 *               platform incl. Vercel (no filesystem dependency).
 *  - "supabase": documents stored in a Supabase Storage bucket (private),
 *               accessed with the service-role key server-side only.
 *
 * The provider is selected with STORAGE_PROVIDER. Switching providers never
 * changes caller code.
 */
import { eq,sql } from "drizzle-orm";
import {createHash} from "node:crypto";
import type {PoolClient} from "pg";
import { db } from "@/lib/db";
import { documentBlobs } from "@/db/schema";
import { AppError } from "@/lib/types";
import {createLocalStorageOperations} from "./storage-operations";
import {assertLocalHttpOrigin,assertLocalPostgresUrl} from "../../perf/local-safety.js";
import {ISOLATED_SUPABASE_PROJECT,isolatedPreviewConnection,isolatedPreviewContext,targetsIsolatedPreview} from './isolated-preview';

export interface StorageProvider {
  put(key: string, data: Buffer, mimeType: string): Promise<void>;
  get(key: string): Promise<{ data: Buffer; mimeType: string }>;
  delete(key: string): Promise<void>;
}

/* --------------------------- database provider --------------------------- */

const dbProvider: StorageProvider = {
  async put(key, data, mimeType) {
    await db.insert(documentBlobs).values({ key, data, mimeType, sizeBytes: data.length });
  },
  async get(key) {
    const rows = await db
      .select({ data: documentBlobs.data, mimeType: documentBlobs.mimeType })
      .from(documentBlobs)
      .where(eq(documentBlobs.key, key))
      .limit(1);
    const row = rows[0];
    if (!row) throw new AppError("NOT_FOUND", "Stored file not found.");
    return { data: row.data, mimeType: row.mimeType };
  },
  async delete(key) {
    await db.delete(documentBlobs).where(eq(documentBlobs.key, key));
  },
};

/* -------------------------- supabase provider ---------------------------- */

const SUPABASE_UPLOAD_LIMIT = 2 * 1024 * 1024;
const SUPABASE_READ_LIMIT = 10 * 1024 * 1024; // Preserve bounded legacy downloads.
const SUPABASE_REQUEST_TIMEOUT_MS = 15_000;
const EXPECTED_SUPABASE_STORAGE_HOST = "xgetzgixalrsmuvfthpf.supabase.co";

function validStorageKey(key: string) {
  if (!key || key.length > 1024 || !/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(key) ||
      key.split("/").some(part => part === "." || part === "..")) {
    throw new AppError("INVALID_STORAGE_KEY", "The stored file identifier is invalid.");
  }
}
type StorageOperation = "WRITE" | "READ" | "DELETE";
function storageFailure(operation: StorageOperation) {
  return new AppError(`STORAGE_${operation}_FAILED`, "The storage operation could not be verified. Try again.");
}
async function storageRequest(url: string, init: RequestInit, operation: StorageOperation) {
  try { return await fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(SUPABASE_REQUEST_TIMEOUT_MS) }); }
  catch { throw storageFailure(operation); } // Never forward provider diagnostics or credentials.
}
async function boundedBody(res: Response, limit: number): Promise<Buffer> {
  const length = res.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > limit)) {
    await res.body?.cancel().catch(() => {}); throw new Error("STORAGE_BODY_LIMIT");
  }
  const reader = res.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Buffer[] = []; let bytes = 0;
  try {
    for (;;) { const chunk = await reader.read(); if (chunk.done) break;
      bytes += chunk.value.length;
      if (bytes > limit) { await reader.cancel(); throw new Error("STORAGE_BODY_LIMIT"); }
      chunks.push(Buffer.from(chunk.value));
    }
    return Buffer.concat(chunks, bytes);
  } finally { reader.releaseLock(); }
}
async function missingObject(res: Response): Promise<boolean> {
  if (res.status !== 404) { await res.body?.cancel().catch(() => {}); return false; }
  try { const body = JSON.parse((await boundedBody(res, 64 * 1024)).toString("utf8")); return body?.code === "NoSuchKey" || body?.error === "NoSuchKey"; }
  catch { return false; }
}

function supabaseConfig() {
  const rawUrl = process.env.SUPABASE_URL;
  const secret=process.env.SUPABASE_SECRET_KEY;
  if(secret&&!/^sb_secret_[A-Za-z0-9_-]{10,}$/.test(secret))throw new AppError('STORAGE_MISCONFIGURED','The server storage credential is invalid.');
  const key = secret||process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "visa-documents";
  if(storageOperationsEnabled()){
    const url=localJournalTarget();
    if(rawUrl!==url||!key||!/^[A-Za-z0-9_-]{1,80}$/.test(bucket))throw new AppError("STORAGE_MISCONFIGURED","The isolated storage configuration is invalid.");
    return {url,key,bucket};
  }
  if (!rawUrl || !key) {
    throw new AppError(
      "STORAGE_MISCONFIGURED",
      "Supabase storage is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).",
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new AppError("STORAGE_MISCONFIGURED", "Supabase storage URL is invalid.");
  }
  let expectedHost=EXPECTED_SUPABASE_STORAGE_HOST;
  const isolatedContext=isolatedPreviewContext(process.env),isolatedTarget=targetsIsolatedPreview(process.env.DATABASE_URL??'');
  if(isolatedContext||isolatedTarget){
    if(!isolatedContext||!isolatedPreviewConnection(process.env.DATABASE_URL??''))throw new AppError('STORAGE_MISCONFIGURED','Storage and database isolation do not match.');
    expectedHost=`${ISOLATED_SUPABASE_PROJECT}.supabase.co`;
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== expectedHost ||
    parsed.username ||
    parsed.password ||
    (parsed.port && parsed.port !== "443") ||
    (parsed.pathname !== "/" && parsed.pathname !== "") ||
    parsed.search ||
    parsed.hash
  ) {
    throw new AppError("STORAGE_MISCONFIGURED", "Supabase storage URL is not an approved HTTPS project endpoint.");
  }
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(bucket)) {
    throw new AppError("STORAGE_MISCONFIGURED", "Supabase storage bucket name is invalid.");
  }
  if (process.env.VERCEL_ENV === "preview" && !/preview/i.test(bucket)) {
    throw new AppError("STORAGE_MISCONFIGURED", "Vercel Preview must use an isolated Preview storage bucket.");
  }
  if (process.env.VERCEL_ENV === "production" && /preview/i.test(bucket)) {
    throw new AppError("STORAGE_MISCONFIGURED", "Production cannot use a Preview storage bucket.");
  }
  return { url: `https://${parsed.hostname}`, key, bucket };
}

function serverStorageHeaders(key:string):Record<string,string>{
  return key.startsWith('sb_secret_')?{apikey:key}:{apikey:key,Authorization:`Bearer ${key}`};
}

const supabaseProvider: StorageProvider = {
  async put(key, data, mimeType) {
    validStorageKey(key);
    if (data.length > SUPABASE_UPLOAD_LIMIT) {
      throw new AppError("FILE_TOO_LARGE", "File exceeds the storage provider limit.");
    }
    const { url, key: serviceKey, bucket } = supabaseConfig();
    const res = await storageRequest(`${url}/storage/v1/object/${bucket}/${encodeURIComponent(key)}`, {
      method: "POST",
      headers: {
        ...serverStorageHeaders(serviceKey),
        "Content-Type": mimeType,
        "x-upsert": "false", // Each version has a new key; never replace immutable bytes.
      },
      body: new Uint8Array(data),
    }, "WRITE");
    if (!res.ok) {
      await res.body?.cancel().catch(() => {}); throw storageFailure("WRITE");
    }
    await res.body?.cancel().catch(() => {});
  },
  async get(key) {
    validStorageKey(key);
    const { url, key: serviceKey, bucket } = supabaseConfig();
    const res = await storageRequest(`${url}/storage/v1/object/${bucket}/${encodeURIComponent(key)}`, {
      headers: serverStorageHeaders(serviceKey),
    }, "READ");
    if (!res.ok) {
      if (await missingObject(res)) throw new AppError("NOT_FOUND", "Stored file not found.");
      throw storageFailure("READ");
    }
    let buf: Buffer;
    try { buf = await boundedBody(res, SUPABASE_READ_LIMIT); } catch { throw storageFailure("READ"); }
    return { data: buf, mimeType: res.headers.get("content-type") ?? "application/octet-stream" };
  },
  async delete(key) {
    validStorageKey(key);
    const { url, key: serviceKey, bucket } = supabaseConfig();
    const res = await storageRequest(`${url}/storage/v1/object/${bucket}/${encodeURIComponent(key)}`, {
      method: "DELETE",
      headers: serverStorageHeaders(serviceKey),
    }, "DELETE");
    if (!res.ok && !await missingObject(res)) throw storageFailure("DELETE");
    await res.body?.cancel().catch(() => {});
  },
};

/* ------------------------------ selection -------------------------------- */

export function storageProvider(): StorageProvider {
  switch (process.env.STORAGE_PROVIDER) {
    case "supabase":
      return storageOperationsEnabled()?journaledProvider:supabaseProvider;
    case undefined:
    case "db":
      return dbProvider;
    default: throw new AppError("STORAGE_MISCONFIGURED", "The storage provider is not configured correctly.");
  }
}

/** No hosted activation is implemented. The flag never authorizes Production. */
export function storageOperationsEnabled(){
  const flag=process.env.STORAGE_OPERATIONS_ENABLED;
  if(!flag||flag==='false')return false;
  if(flag!=='local-qualification')throw new AppError("STORAGE_MISCONFIGURED","Storage operations require qualification.");
  localJournalTarget();return true;
}
function localJournalTarget(){
  let uri:URL;try{uri=new URL(assertLocalPostgresUrl(process.env.DATABASE_URL??''));}catch{throw new AppError("STORAGE_MISCONFIGURED","Storage target is not qualified.");}
  if(uri.port!=='5434'||uri.pathname!=='/essafaria_test'||process.env.DATABASE_SCHEMA!=='public'||process.env.STORAGE_PROVIDER!=='supabase'||
    process.env.VERCEL||process.env.VERCEL_ENV||process.env.VERCEL_TARGET_ENV||process.env.NETLIFY||process.env.RENDER||process.env.CF_PAGES)
    throw new AppError("STORAGE_MISCONFIGURED","Storage target is not qualified.");
  return assertLocalHttpOrigin(process.env.STORAGE_LOCAL_HTTP_ORIGIN??'');
}
let journal:ReturnType<typeof createLocalStorageOperations>|undefined;
let binding:string|undefined;
function operations(){
  const origin=localJournalTarget(),bucket=process.env.SUPABASE_STORAGE_BUCKET??'visa-documents';
  const target=JSON.stringify([origin,bucket,process.env.DATABASE_URL]);
  if(journal&&binding!==target)throw new AppError("STORAGE_MISCONFIGURED","The journal target changed.");
  if(!journal){journal=createLocalStorageOperations({enabled:true,databaseUrl:process.env.DATABASE_URL!,schema:'public',origin,bucket},supabaseProvider);binding=target;}
  return journal;
}
const journaledProvider:StorageProvider={
  async put(key,data,mime){
    const op=operations();
    const ticket=await op.reserve({key,mimeType:mime,sizeBytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});
    await op.upload(ticket.id,data);
  },
  get(key){return supabaseProvider.get(key);},
  async delete(key){
    const op=operations(),row=await op.findByKey(key);
    if(row.state==='DELETED')return;
    await op.requestDeletion(row.id);
    const result=await op.retryDeletion(row.id);
    if(result.state!=='DELETED')throw new AppError("STORAGE_DELETE_PENDING","File removal is pending verification. No completed physical deletion is claimed.");
  },
};
type WriterTransaction=Pick<typeof db,'execute'>|Pick<PoolClient,'query'>;
function journalConnection(tx:WriterTransaction):Pick<PoolClient,'query'>{
  if(typeof Reflect.get(tx,'query')==='function')return tx as Pick<PoolClient,'query'>;
  // Convert our own positional SQL into parameter-bound Drizzle chunks. This
  // bridges public query APIs, never private transaction/session internals.
  return {query:async(text:string,values:unknown[]=[])=>{
    const chunks=text.split(/\$(\d+)/).map((part,index)=>index%2?sql`${values[Number(part)-1]}`:sql.raw(part));
    return (tx as Pick<typeof db,'execute'>).execute(sql.join(chunks,sql.raw('')));
  }} as Pick<PoolClient,'query'>;
}
export async function storageReferenceCommitted(tx:WriterTransaction,keys:string|string[]){
  if(!storageOperationsEnabled())return;
  for(const key of typeof keys==='string'?[keys]:keys)await operations().referenceCommitted(journalConnection(tx),key);
}
export async function storageDeletionQueued(tx:WriterTransaction,keys:string|string[]){
  if(!storageOperationsEnabled())return;
  for(const key of typeof keys==='string'?[keys]:keys)await operations().deletionQueued(journalConnection(tx),key);
}
export async function reconcileStorageOperations(limit=50){
  if(!storageOperationsEnabled())throw new AppError("STORAGE_MISCONFIGURED","Storage operations are not enabled.");
  return operations().reconcile(limit);
}
export async function closeStorageOperations(){if(journal)await journal.close();journal=undefined;binding=undefined;}
export function storageOperationsBinding(){
  if(!storageOperationsEnabled())throw new AppError('STORAGE_MISCONFIGURED','Durable storage operations are required.');
  return {origin:localJournalTarget(),bucket:process.env.SUPABASE_STORAGE_BUCKET??'visa-documents'};
}

/** Opaque, unguessable, tenant-scoped storage key. Never derived from user input. */
export function buildStorageKey(applicationId: string, documentId: string): string {
  return `visa-documents/${applicationId}/${documentId}`;
}
