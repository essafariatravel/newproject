import { sql } from "drizzle-orm";
import type { PoolClient } from "pg";
import type { IdentityTransaction } from "./account-security";
import { qualifiedTable } from "./database-schema";
import { AppError } from "./types";

interface AgencyIdentity { legalName: string; email: string; exceptAgencyId?: string }
const conflict = () => new AppError("DUPLICATE", "An agency with this name or professional email already exists. Review its record before creating another agency.");

/** New activity is forbidden on CLOSED tenants. Authorized Staff may still
 * fulfil an existing open dossier; terminal archives remain read-only. */
export async function assertAgencyOperational(tx: IdentityTransaction, agencyId: string, applicationId?:string): Promise<void> {
  const result = await tx.execute(sql`select status from ${sql.raw(qualifiedTable("agencies"))} where id=${agencyId}`);
  if (result.rows[0]?.status === "CLOSED") {
    if(applicationId){const dossier=await tx.execute(sql`select s.is_terminal from ${sql.raw(qualifiedTable('applications'))} a join ${sql.raw(qualifiedTable('statuses'))} s on s.id=a.status_id where a.id=${applicationId} and a.agency_id=${agencyId}`);if(dossier.rows[0]?.is_terminal===false)return;}
    throw new AppError("INVALID_STATE", "This agency is closed. Historical records are read-only.");
  }
}

/** Call only while holding the shared identity write lock. Suspended agencies
 * still reserve their identity; a definitively CLOSED historical tenant does not.
 * Employee accounts may continue sharing their own agency's contact mailbox. */
export async function assertAgencyIdentityAvailable(tx: IdentityTransaction, input: AgencyIdentity): Promise<void> {
  const result = await tx.execute(sql`select id from ${sql.raw(qualifiedTable("agencies"))}
    where status <> 'CLOSED' and id <> ${input.exceptAgencyId ?? "00000000-0000-0000-0000-000000000000"}::uuid
    and (lower(regexp_replace(btrim(legal_name), '\\s+', ' ', 'g')) = lower(regexp_replace(btrim(${input.legalName}), '\\s+', ' ', 'g'))
      or lower(btrim(email)) = lower(btrim(${input.email}))) limit 1`);
  if (result.rows.length) throw conflict();
}

export async function assertAgencyIdentityAvailablePg(client: PoolClient, input: AgencyIdentity): Promise<void> {
  const result = await client.query(`select id from ${qualifiedTable("agencies")}
    where status <> 'CLOSED' and id <> $3::uuid
    and (lower(regexp_replace(btrim(legal_name), '\\s+', ' ', 'g')) = lower(regexp_replace(btrim($1::text), '\\s+', ' ', 'g'))
      or lower(btrim(email)) = lower(btrim($2::text))) limit 1`,
  [input.legalName, input.email, input.exceptAgencyId ?? "00000000-0000-0000-0000-000000000000"]);
  if (result.rows.length) throw conflict();
}
