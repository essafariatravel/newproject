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
import { logErrorOnce } from "@/lib/observability";

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

const SUPABASE_UPLOAD_LIMIT = 10 * 1024 * 1024;

function supabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "visa-documents";
  if (!url || !key) {
    throw new AppError(
      "STORAGE_MISCONFIGURED",
      "Supabase storage is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).",
    );
  }
  return { url: url.replace(/\/$/, ""), key, bucket };
}

const supabaseProvider: StorageProvider = {
  async put(key, data, mimeType) {
    if (data.length > SUPABASE_UPLOAD_LIMIT) {
      throw new AppError("FILE_TOO_LARGE", "File exceeds the storage provider limit.");
    }
    const { url, key: serviceKey, bucket } = supabaseConfig();
    const res = await fetch(`${url}/storage/v1/object/${bucket}/${encodeURIComponent(key)}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": mimeType,
        "x-upsert": "true",
      },
      body: new Uint8Array(data),
    });
    if (!res.ok) {
      throw new AppError("STORAGE_WRITE_FAILED", "Could not store the file.");
    }
  },
  async get(key) {
    const { url, key: serviceKey, bucket } = supabaseConfig();
    const res = await fetch(`${url}/storage/v1/object/${bucket}/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${serviceKey}` },
    });
    if (!res.ok) {
      throw new AppError("NOT_FOUND", "Stored file not found.");
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return { data: buf, mimeType: res.headers.get("content-type") ?? "application/octet-stream" };
  },
  async delete(key) {
    const { url, key: serviceKey, bucket } = supabaseConfig();
    const res = await fetch(`${url}/storage/v1/object/${bucket}/${encodeURIComponent(key)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${serviceKey}` },
    });
    if (!res.ok && res.status !== 404) {
    }
  },
};

function instrumentProvider(name: "db" | "supabase", provider: StorageProvider): StorageProvider {
  return {
    async put(key, data, mimeType) {
      try {
        await provider.put(key, data, mimeType);
      } catch (error) {
        logErrorOnce("storage.put.failed", error, {
          severity: "error",
          classification: "BUSINESS_FAILURE",
          result: "technical_failed",
          action: "storage.put",
          metadata: { provider: name },
        });
        throw error;
      }
    },
    async get(key) {
      try {
        return await provider.get(key);
      } catch (error) {
        logErrorOnce("storage.get.failed", error, {
          severity: "error",
          classification: "BUSINESS_FAILURE",
          result: "technical_failed",
          action: "storage.get",
          metadata: { provider: name },
        });
        throw error;
      }
    },
    async delete(key) {
      try {
        await provider.delete(key);
      } catch (error) {
        logErrorOnce("storage.delete.failed", error, {
          severity: "warning",
          classification: "BUSINESS_FAILURE",
          result: "technical_failed",
          action: "storage.delete",
          metadata: { provider: name },
        });
        throw error;
      }
    },
  };
}

const instrumentedDbProvider = instrumentProvider("db", dbProvider);
const instrumentedSupabaseProvider = instrumentProvider("supabase", supabaseProvider);

/* ------------------------------ selection -------------------------------- */

export function storageProvider(): StorageProvider {
  switch (process.env.STORAGE_PROVIDER) {
    case "supabase":
      return instrumentedSupabaseProvider;
    default:
      return instrumentedDbProvider;
  }
}

/** Opaque, unguessable, tenant-scoped storage key. Never derived from user input. */
export function buildStorageKey(applicationId: string, documentId: string): string {
  return `visa-documents/${applicationId}/${documentId}`;
}
