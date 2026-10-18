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
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { documentBlobs } from "@/db/schema";
import { AppError } from "@/lib/types";

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
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "visa-documents";
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
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== EXPECTED_SUPABASE_STORAGE_HOST ||
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
        Authorization: `Bearer ${serviceKey}`,
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
      headers: { Authorization: `Bearer ${serviceKey}` },
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
      headers: { Authorization: `Bearer ${serviceKey}` },
    }, "DELETE");
    if (!res.ok && !await missingObject(res)) throw storageFailure("DELETE");
    await res.body?.cancel().catch(() => {});
  },
};

/* ------------------------------ selection -------------------------------- */

export function storageProvider(): StorageProvider {
  switch (process.env.STORAGE_PROVIDER) {
    case "supabase":
      return supabaseProvider;
    case undefined:
    case "db":
      return dbProvider;
    default: throw new AppError("STORAGE_MISCONFIGURED", "The storage provider is not configured correctly.");
  }
}

/** Opaque, unguessable, tenant-scoped storage key. Never derived from user input. */
export function buildStorageKey(applicationId: string, documentId: string): string {
  return `visa-documents/${applicationId}/${documentId}`;
}
