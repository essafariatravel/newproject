import { randomUUID } from "node:crypto";
import { z } from "zod";
import { pool } from "@/lib/db";
import { qualifiedTable as q } from "@/lib/database-schema";
import { generateSessionToken, hashToken } from "@/lib/crypto";
import { requirePermission } from "@/lib/rbac";
import { AppError, type AuthUser } from "@/lib/types";
import { validateRegistrationFile, type RegistrationFileInput } from "@/lib/registrations";
import { REGISTRATION_DOCUMENT_CATEGORIES, type RegistrationDocumentCategory } from "@/lib/registration-constants";
import { storageProvider } from "@/lib/storage";
import { currentOperationActorPg } from "@/lib/operation-identity";
import { sha256Hex } from "@/lib/file-integrity";

const issueSchema = z.object({ registrationId: z.string().uuid(), note: z.string().trim().min(10).max(2000), slots: z.array(z.object({category: z.enum(REGISTRATION_DOCUMENT_CATEGORIES), label: z.string().trim().min(2).max(160)})).min(1).max(4) });
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const invalid = () => new AppError("INVALID_LINK", "This document link is invalid, expired or already completed.");

export async function createRegistrationFollowup(input: { actor: AuthUser; registrationId: string; note: string; slots: Array<{category: RegistrationDocumentCategory; label: string}> }): Promise<{token: string; expiresAt: Date}> {
  requirePermission(input.actor, "registrations.manage");
  const values = issueSchema.parse(input);
  if (new Set(values.slots.map((slot) => slot.category)).size !== values.slots.length) throw new AppError("VALIDATION", "Request each document category once.");
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
  const client = await pool.connect();
  try {
    await client.query("begin");
    input={...input,actor:await currentOperationActorPg(client,input.actor)};
    const found = await client.query(`select status from ${q("agency_registrations")} where id=$1 for update`, [values.registrationId]);
    const status = found.rows[0]?.status as string | undefined;
    if (!status || !["UNDER_REVIEW", "MORE_INFORMATION_REQUIRED"].includes(status)) throw new AppError("INVALID_STATE", "Start review before requesting administrative documents.");
    await client.query(`update ${q("agency_registration_followup_tokens")} set revoked_at=now() where registration_id=$1 and used_at is null and revoked_at is null`, [values.registrationId]);
    await client.query(`update ${q("agency_registration_requests")} set status='CANCELLED' where registration_id=$1 and status='OPEN'`, [values.registrationId]);
    for (const slot of values.slots) await client.query(`insert into ${q("agency_registration_requests")} (registration_id,category,label,note,requested_by) values ($1,$2,$3,$4,$5)`, [values.registrationId, slot.category, slot.label, values.note, input.actor.id]);
    await client.query(`insert into ${q("agency_registration_followup_tokens")} (registration_id,token_hash,expires_at,created_by) values ($1,$2,$3,$4)`, [values.registrationId, hashToken(token), expiresAt, input.actor.id]);
    await client.query(`update ${q("agency_registrations")} set status='MORE_INFORMATION_REQUIRED', reviewed_by=$2, reviewed_at=coalesce(reviewed_at,now()),updated_at=now() where id=$1`, [values.registrationId,input.actor.id]);
    await client.query(`insert into ${q("agency_registration_history")} (registration_id,kind,from_status,to_status,actor_id,note) values ($1,'INFO_REQUEST',$2,'MORE_INFORMATION_REQUIRED',$3,$4)`, [values.registrationId,status,input.actor.id,values.note]);
    await client.query(`insert into ${q("audit_logs")} (actor_id,actor_email,actor_role,action,entity,entity_id,metadata) values ($1,$2,$3,'REGISTRATION_DOCUMENTS_REQUESTED','agency_registration',$4,$5)`, [input.actor.id,input.actor.email,input.actor.role,values.registrationId,JSON.stringify({categories:values.slots.map((s)=>s.category),expiresAt:expiresAt.toISOString()})]);
    await client.query("commit");
    return {token,expiresAt};
  } catch (error) { await client.query("rollback").catch(()=>{}); throw error; }
  finally { client.release(); }
}

export async function resolveRegistrationFollowup(token: string): Promise<{registrationId: string; reference: string; locale: string; note: string; slots: Array<{id: string; category: string; label: string; status: string}>}|null> {
  if (!tokenPattern.test(token)) return null;
  const found = await pool.query(`select r.id,r.reference,r.locale,s.id as slot_id,s.category,s.label,s.status,s.note from ${q("agency_registration_followup_tokens")} t join ${q("agency_registrations")} r on r.id=t.registration_id join ${q("agency_registration_requests")} s on s.registration_id=r.id and s.status='OPEN' where t.token_hash=$1 and t.expires_at>now() and t.revoked_at is null and t.used_at is null and r.status='MORE_INFORMATION_REQUIRED' order by s.created_at,s.id`,[hashToken(token)]);
  const reg = found.rows[0];
  if (!reg) return null;
  return {registrationId:reg.id,reference:reg.reference,locale:reg.locale,note:reg.note,slots:found.rows.map((row)=>({id:row.slot_id,category:row.category,label:row.label,status:row.status}))};
}

export async function uploadRegistrationFollowup(input: {token: string; slotId: string; file: RegistrationFileInput}): Promise<void> {
  if (!tokenPattern.test(input.token) || !z.string().uuid().safeParse(input.slotId).success) throw invalid();
  const tokenHash = hashToken(input.token);
  // Pre-stage only for a currently authorised slot. Every gate is checked again
  // under the registration lock after storage has released its pool connection.
  const lookup = await pool.query(`select t.registration_id,s.category from ${q("agency_registration_followup_tokens")} t join ${q("agency_registrations")} r on r.id=t.registration_id join ${q("agency_registration_requests")} s on s.registration_id=r.id and s.id=$2 and s.status='OPEN' where t.token_hash=$1 and t.expires_at>now() and t.revoked_at is null and t.used_at is null and r.status='MORE_INFORMATION_REQUIRED'`,[tokenHash,input.slotId]);
  const registrationId = lookup.rows[0]?.registration_id as string | undefined;
  if (!registrationId) throw invalid();
  const file = {...input.file,category:lookup.rows[0]!.category as RegistrationDocumentCategory};
  if (file.size !== file.data.length) throw new AppError("FILE_CONTENT", "Invalid file size.");
  validateRegistrationFile(file);
  const sha256 = sha256Hex(file.data);
  const storageKey = `agency-registrations/${registrationId}/${randomUUID()}`;
  let committed = false;
  try {
    await storageProvider().put(storageKey,file.data,file.type);
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("set local statement_timeout = '30s'");
      const reg = await client.query(`select status from ${q("agency_registrations")} where id=$1 for update`,[registrationId]);
      const validToken = await client.query(`select id from ${q("agency_registration_followup_tokens")} where token_hash=$1 and registration_id=$2 and expires_at>now() and revoked_at is null and used_at is null for update`,[tokenHash,registrationId]);
      if (reg.rows[0]?.status !== "MORE_INFORMATION_REQUIRED" || !validToken.rows[0]) throw invalid();
      const found = await client.query(`select category from ${q("agency_registration_requests")} where id=$1 and registration_id=$2 and status='OPEN' for update`,[input.slotId,registrationId]);
      const slot = found.rows[0];
      if (!slot || slot.category !== file.category) throw invalid();
      const inserted = await client.query(`insert into ${q("agency_registration_documents")} (registration_id,category,original_filename,mime_type,size_bytes,sha256,storage_key) values ($1,$2,$3,$4,$5,$6,$7) returning id`,[registrationId,file.category,file.name,file.type,file.size,sha256,storageKey]);
      await client.query(`update ${q("agency_registration_requests")} set status='RECEIVED',document_id=$2,received_at=now() where id=$1`,[input.slotId,inserted.rows[0]!.id]);
      const remaining = await client.query(`select id from ${q("agency_registration_requests")} where registration_id=$1 and status='OPEN' limit 1`,[registrationId]);
      if (!remaining.rows.length) {
        await client.query(`update ${q("agency_registration_followup_tokens")} set used_at=now() where id=$1`,[validToken.rows[0]!.id]);
        await client.query(`update ${q("agency_registrations")} set status='UNDER_REVIEW',updated_at=now() where id=$1`,[registrationId]);
      }
      await client.query(`insert into ${q("agency_registration_history")} (registration_id,kind,from_status,to_status,note) values ($1,'INFO_REQUEST','MORE_INFORMATION_REQUIRED',$2,$3)`,[registrationId,remaining.rows.length?"MORE_INFORMATION_REQUIRED":"UNDER_REVIEW",`Administrative document received: ${file.category}`]);
      await client.query(`insert into ${q("audit_logs")} (action,entity,entity_id,metadata) values ('REGISTRATION_DOCUMENT_RECEIVED','agency_registration',$1,$2)`,[registrationId,JSON.stringify({requestId:input.slotId,documentId:inserted.rows[0]!.id,sha256})]);
      await client.query("commit"); committed=true;
    } catch (error) { await client.query("rollback").catch(()=>{}); throw error; }
    finally { client.release(); }
  } finally { if (!committed) await storageProvider().delete(storageKey).catch(()=>{}); }
}
