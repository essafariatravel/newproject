import type { PoolClient } from "pg";
import { pool } from "./db";
import { qualifiedTable } from "./database-schema";
import { currentOperationActorPg } from "./operation-identity";
import { verifyPassword } from "./crypto";
import { consumeAuthRateLimit } from "./auth-rate-limit";
import { AppError, type AuthUser } from "./types";
import { targetsSupabaseProject } from './database-config';

type Environment = Record<string, string | undefined>;
export interface ClosureInput {
  agencyId: string; confirmationName: string; currentPassword: string;
  acceptObligations?: boolean; responsibilityNote?: string;
}
export interface ClosurePreview {
  id: string; legalName: string; status: string; balance: string; currency: string;
  userCount: number; openApplications: number; completedApplications: number;
  pendingTopups: number; blockers: string[]; obligations: string[];
}

/** Validate the trusted server target before pool/rate-limit writes. Owner,
 * live MFA session, password and typed confirmation are independently required.
 * The old Preview-only mission lock is replaced, never a client opt-in. */
export function requireAgencyClosureTarget(env: Environment = process.env): void {
  if(env.ESSAFARIA_AGENCY_CLOSURE_DISABLED!==undefined&&env.ESSAFARIA_AGENCY_CLOSURE_DISABLED!=='false')throw new AppError('CLOSURE_TARGET_BLOCKED','Agency closure is disabled.');
  try {
    const url = new URL(env.DATABASE_URL ?? "");
    const local = !env.VERCEL && !env.VERCEL_ENV && (!env.DATABASE_SCHEMA || env.DATABASE_SCHEMA === "public") &&
      ["postgres:", "postgresql:"].includes(url.protocol) && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
      ((url.port === "5434" && url.pathname === "/essafaria_test") || (url.port==='5438'&&url.pathname==='/essafaria_f030_ui')) && !url.search && !url.hash;
    if(local)return;
    const hosted=env.VERCEL==='1'&&env.VERCEL_PROJECT_ID==='prj_0WOxlorbYiljjjBvZ1Cm6M9JmPdp'&&
      ((env.VERCEL_ENV==='production'&&env.DATABASE_SCHEMA==='visa_os')||(env.VERCEL_ENV==='preview'&&env.DATABASE_SCHEMA==='visa_os_preview'))&&
      (!env.VERCEL_TARGET_ENV||env.VERCEL_TARGET_ENV===env.VERCEL_ENV)&&['postgres:','postgresql:'].includes(url.protocol)&&
      url.pathname==='/postgres'&&['','5432','6543'].includes(url.port)&&!url.hash&&
      targetsSupabaseProject(env.DATABASE_URL??'','xgetzgixalrsmuvfthpf')&&
      (url.hostname!=='db.xgetzgixalrsmuvfthpf.supabase.co'||decodeURIComponent(url.username)==='postgres');
    if(hosted){
      for(const [key,value]of url.searchParams){
        if(!['sslmode','ssl','pgbouncer','connection_limit','pool_timeout','connect_timeout','application_name'].includes(key.toLowerCase()))throw Error('UNSAFE_TARGET');
        if(key.toLowerCase()==='sslmode'&&!['require','verify-ca','verify-full'].includes(value))throw Error('UNSAFE_TLS');
        if(key.toLowerCase()==='ssl'&&value!=='true')throw Error('UNSAFE_TLS');
      }
      return;
    }
  } catch { /* Never expose a credential-bearing connection URI. */ }
  throw new AppError('CLOSURE_TARGET_BLOCKED','Agency closure target could not be verified.');
}

function requireOwner(actor: AuthUser): void {
  if (actor.role !== "SUPER_ADMIN" || actor.agencyId) throw new AppError("FORBIDDEN", "Only SUPER_ADMIN can close an agency.");
}

async function snapshot(client: PoolClient, agencyId: string, lock = false): Promise<ClosurePreview> {
  const q = qualifiedTable;
  // Acquire the row lock before reading the ledger. If a credit commits while
  // this waits, the following READ COMMITTED statement sees both its new
  // balance and its ledger row, rather than mixing snapshots in one SELECT.
  if (lock) await client.query(`select id from ${q("agencies")} where id=$1 for update`, [agencyId]);
  const { rows } = await client.query(`select a.id,a.legal_name as "legalName",a.status,a.balance::text,a.currency,
    (select count(*)::int from ${q("users")} u where u.agency_id=a.id) as "userCount",
    (select count(*)::int from ${q("applications")} app join ${q("statuses")} s on s.id=app.status_id where app.agency_id=a.id and not s.is_terminal) as "openApplications",
    (select count(*)::int from ${q("applications")} app join ${q("statuses")} s on s.id=app.status_id where app.agency_id=a.id and s.is_terminal) as "completedApplications",
    (select count(*)::int from ${q("wallet_topup_requests")} w where w.agency_id=a.id and w.status='PENDING') as "pendingTopups",
    a.balance = coalesce((select sum(w.balance_after-w.balance_before) from ${q("wallet_transactions")} w where w.agency_id=a.id),0)
      and not exists(select 1 from ${q("wallet_transactions")} w where w.agency_id=a.id and (
        w.currency<>'DZD' or
        (w.type in ('CREDIT','COMMERCIAL_DISCOUNT') and w.balance_after<>w.balance_before+w.amount) or
        (w.type in ('DEBIT','APPLICATION_CHARGE','COMMERCIAL_SURCHARGE') and w.balance_after<>w.balance_before-w.amount)))
      and not exists(select 1 from (
        select balance_before,lag(balance_after) over(order by created_at,reference) as previous_after,
          row_number() over(order by created_at,reference) as ledger_row
        from ${q("wallet_transactions")} where agency_id=a.id
      ) ledger where (ledger_row=1 and balance_before<>0) or (ledger_row>1 and balance_before<>previous_after))
      and not exists(select 1 from ${q("wallet_topup_requests")} r
        left join ${q("wallet_transactions")} w on w.id=r.wallet_transaction_id
        where r.agency_id=a.id and r.status='PROCESSED' and
          (w.id is null or w.agency_id<>a.id or w.type<>'CREDIT' or w.currency<>'DZD' or w.amount<=0 or w.amount>r.amount)) as reconciled
    from ${q("agencies")} a where a.id=$1`, [agencyId]);
  const row = rows[0];
  if (!row) throw new AppError("NOT_FOUND", "Agency not found.");
  const obligations = [
    Number(row.balance) !== 0 && "BALANCE_NOT_ZERO",
    row.openApplications > 0 && "OPEN_APPLICATIONS",
    row.pendingTopups > 0 && "PENDING_TOPUPS",
  ].filter((value): value is string => Boolean(value));
  const blockers=[(!row.reconciled||Number(row.balance)<0)&&'WALLET_RECONCILIATION_REQUIRED',row.currency!=='DZD'&&'CURRENCY_REVIEW_REQUIRED'].filter((value):value is string=>Boolean(value));
  return { id: row.id, legalName: row.legalName, status: row.status, balance: row.balance, currency: row.currency,
    userCount: row.userCount, openApplications: row.openApplications, completedApplications: row.completedApplications,
    pendingTopups: row.pendingTopups, blockers, obligations };
}

export async function agencyClosurePreview(actor: AuthUser, agencyId: string): Promise<ClosurePreview> {
  requireOwner(actor);
  const client = await pool.connect();
  try {
    await client.query("begin");
    await currentOperationActorPg(client, actor, "read");
    const result = await snapshot(client, agencyId);
    await client.query("commit");
    return result;
  } catch (error) { await client.query("rollback"); throw error; }
  finally { client.release(); }
}

export async function closeAgency(actor: AuthUser, input: ClosureInput): Promise<ClosurePreview> {
  requireAgencyClosureTarget();
  requireOwner(actor);
  if (!actor.sessionId || actor.mfaPending) throw new AppError("UNAUTHENTICATED", "Verify your current session before closing an agency.");
  if (input.currentPassword.length > 200 || !await consumeAuthRateLimit("agency-closure", actor.id, 5, 15 * 60_000)) {
    throw new AppError("INVALID_CREDENTIALS", "Verification failed. Please try again.");
  }
  const client = await pool.connect(), q = qualifiedTable;
  try {
    await client.query("begin");
    await client.query("set local lock_timeout='5s'");
    await client.query("set local statement_timeout='20s'");
    const current = await currentOperationActorPg(client, actor);
    requireOwner(current);
    const session = await client.query(`select 1 from ${q("sessions")} where id=$1 and user_id=$2 and credential_version=$3
      and expires_at>now() and last_activity_at>now()-interval '30 minutes' and mfa_verified_at is not null`,
    [actor.sessionId, current.id, current.credentialVersion]);
    if (!session.rows.length) throw new AppError("UNAUTHENTICATED", "Verify your current session before closing an agency.");
    const password = await client.query(`select password_hash from ${q("users")} where id=$1`, [current.id]);
    if (!await verifyPassword(input.currentPassword, password.rows[0]!.password_hash)) throw new AppError("INVALID_CREDENTIALS", "Verification failed. Please try again.");
    const before = await snapshot(client, input.agencyId, true);
    if (input.confirmationName.trim() !== before.legalName.trim()) throw new AppError("VALIDATION", "Enter the exact agency legal name to confirm closure.");
    if (before.status === "CLOSED") { await client.query("commit"); return before; }
    if (before.blockers.length) throw new AppError("CLOSURE_BLOCKED", "Closure is blocked until financial integrity is verified.");
    if(before.obligations.length&&(input.acceptObligations!==true||!input.responsibilityNote?.trim()||input.responsibilityNote.length>2000)){
      throw new AppError('OBLIGATIONS_ACKNOWLEDGEMENT_REQUIRED','ESSAFARIA must explicitly assume the retained outstanding obligations.');
    }
    const members = await client.query(`update ${q("users")} set status='SUSPENDED',credential_version=credential_version+1,updated_at=now() where agency_id=$1 returning id`, [input.agencyId]);
    const ids = members.rows.map(row => row.id);
    for (const table of ["sessions", "account_access_tokens", "account_activation_tokens"]) {
      await client.query(`delete from ${q(table)} where user_id=any($1::uuid[]) ${table === "sessions" ? "" : "and used_at is null"}`, [ids]);
    }
    await client.query(`update ${q("account_recovery_requests")} set status='CLOSED',resolved_by=$2,resolved_at=now() where user_id=any($1::uuid[]) and status in ('PENDING','LINK_ISSUED')`, [ids, current.id]);
    await client.query(`update ${q("agency_registration_followup_tokens")} set revoked_at=now() where registration_id in (select id from ${q("agency_registrations")} where agency_id=$1) and revoked_at is null and used_at is null`, [input.agencyId]);
    await client.query(`update ${q("agency_registration_requests")} set status='CANCELLED' where registration_id in (select id from ${q("agency_registrations")} where agency_id=$1) and status='OPEN'`, [input.agencyId]);
    await client.query(`update ${q("agencies")} set status='CLOSED',updated_at=now() where id=$1`, [input.agencyId]);
    await client.query(`insert into ${q("audit_logs")}(actor_id,actor_email,actor_role,agency_id,action,entity,entity_id,metadata)
      values($1,$2,$3,$4::uuid,'AGENCY_CLOSED','agency',$4::text,$5::jsonb)`, [current.id, current.email, current.role, input.agencyId,
      JSON.stringify({ ...before, closureScope: "OPERATIONAL_ACCESS", retentionPolicyChanged: false, archiveErasureAuthorized: false,
        obligationsAccepted:before.obligations.length>0,responsibleStaffId:current.id,responsibilityNote:input.responsibilityNote?.trim()||null,
        userIds: ids, archiveAgencyId: before.id, actorName: current.name, actorUsername: current.username })]);
    await client.query("commit");
    return { ...before, status: "CLOSED" };
  } catch (error) { await client.query("rollback"); throw error; }
  finally { client.release(); }
}
