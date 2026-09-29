import { validateDocumentFormat } from "@/lib/upload-validation";
import { and, eq, like, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { documentBlobs } from "@/db/schema";
import { AppError, ALLOWED_MIME_TYPES, MAX_UPLOAD_BYTES, isAgencyRole, type AuthUser } from "@/lib/types";
import { fileNameProblem } from "@/lib/filename";
import { listRequirementsForVisaType, type RequestDocument } from "@/lib/requests";

// Temporary upload bytes only: no application, reference, checklist or charge.
// Uploads begin only after final confirmation. They expire after one hour and
// are collected on the next upload; successful submissions remove them eagerly.
const TTL = 60 * 60 * 1000;
const uuid = z.string().uuid();
const metadata = z.object({ name: z.string().max(200), type: z.string(), visaTypeId: uuid, data: z.string() });
function prefix(actor: AuthUser, attempt: string) {
  if (!actor.agencyId || !isAgencyRole(actor.role) || actor.mustChangePassword) throw new AppError("FORBIDDEN", "Agency access required.");
  uuid.parse(attempt);
  return `pending-request/${actor.agencyId}/${actor.id}/${attempt}/`;
}

export async function stageRequestUpload(input: { actor: AuthUser; attempt: string; visaTypeId: string; documentTypeId: string; slot: number; file: RequestDocument["file"] }) {
  const base = prefix(input.actor, input.attempt);
  uuid.parse(input.documentTypeId); uuid.parse(input.visaTypeId);
  if (!Number.isInteger(input.slot) || input.slot < 0 || input.slot >= 3) throw new AppError("VALIDATION", "Choose at most three files per document.");
  const f = input.file;
  if (!f.data.length) throw new AppError("EMPTY_FILE", "The uploaded file is empty.");
  if (f.size > MAX_UPLOAD_BYTES || f.data.length > MAX_UPLOAD_BYTES) throw new AppError("FILE_TOO_LARGE", "Files must be 2 MB or smaller.");
  if (!ALLOWED_MIME_TYPES.includes(f.type)) throw new AppError("UNSUPPORTED_TYPE", "Unsupported document type.");
  if (fileNameProblem(f.name)) throw new AppError("INVALID_FILENAME", "Choose a valid filename.");
  validateDocumentFormat(f);
  const requirements = await listRequirementsForVisaType(input.visaTypeId);
  if (!requirements.some((r) => r.documentTypeId === input.documentTypeId)) throw new AppError("VALIDATION", "This document is not part of the selected visa.");
  const token = `${input.documentTypeId}/${input.slot}`;
  const key = base + token;
  const data = Buffer.from(JSON.stringify({ name: f.name, type: f.type, visaTypeId: input.visaTypeId, data: f.data.toString("base64") }));
  await db.transaction(async (tx) => {
    // Serialize quota checks across this user's tabs and attempts.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.actor.id}))`);
    await tx.delete(documentBlobs).where(and(like(documentBlobs.key, "pending-request/%"), lt(documentBlobs.createdAt, new Date(Date.now() - TTL))));
    const [usage] = await tx.select({ n: sql<number>`count(*)::int` }).from(documentBlobs)
      .where(like(documentBlobs.key, `pending-request/${input.actor.agencyId}/${input.actor.id}/%`));
    const [existing] = await tx.select({ key: documentBlobs.key }).from(documentBlobs).where(eq(documentBlobs.key, key));
    if (!existing && (usage?.n ?? 0) >= 60) throw new AppError("VALIDATION", "Too many pending files. Please try again later.");
    await tx.insert(documentBlobs).values({ key, data, mimeType: "application/json", sizeBytes: data.length })
      .onConflictDoUpdate({ target: documentBlobs.key, set: { data, sizeBytes: data.length, createdAt: new Date() } });
  });
  return token;
}

export async function resolveRequestUploads(actor: AuthUser, attempt: string, visaTypeId: string, tokens: string[]): Promise<RequestDocument[]> {
  const base = prefix(actor, attempt);
  if (tokens.length > 60 || new Set(tokens).size !== tokens.length) throw new AppError("VALIDATION", "Invalid upload list.");
  return Promise.all(tokens.map(async (token) => {
    if (!/^[0-9a-f-]{36}\/[012]$/i.test(token)) throw new AppError("VALIDATION", "Invalid upload.");
    const [row] = await db.select().from(documentBlobs).where(eq(documentBlobs.key, base + token));
    if (!row || row.createdAt.getTime() < Date.now() - TTL) throw new AppError("EMPTY_FILE", "The upload expired. Please retry with the selected files.");
    const value = metadata.parse(JSON.parse(row.data.toString("utf8")));
    if (value.visaTypeId !== visaTypeId) throw new AppError("VALIDATION", "The visa changed. Please upload the documents again.");
    const data = Buffer.from(value.data, "base64");
    return { documentTypeId: token.split("/")[0]!, file: { name: value.name, type: value.type, size: data.length, data } };
  }));
}

export async function clearRequestUploads(actor: AuthUser, attempt: string) {
  await db.delete(documentBlobs).where(like(documentBlobs.key, `${prefix(actor, attempt)}%`));
}
