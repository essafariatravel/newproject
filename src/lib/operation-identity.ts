import { eq } from "drizzle-orm";
import type { PoolClient } from "pg";
import { agencies, users } from "@/db/schema";
import { lockIdentityState, type IdentityTransaction } from "@/lib/account-security";
import { qualifiedTable } from "@/lib/database-schema";
import { AppError, isAgencyRole, isStaffRole, type AuthUser } from "@/lib/types";
import { readStaffProfile, STAFF_PROFILE_PREFIX } from '@/lib/staff-profile';

interface CurrentIdentity extends Omit<AuthUser, "role"> {
  role: string;
  activationPending: boolean;
  credentialVersion: number;
}

function verifiedActor(actor: AuthUser, current: CurrentIdentity | undefined): AuthUser {
  // Authentication can precede slow storage work. A credential/role change or
  // suspension during that interval must invalidate the captured authorization.
  if (!current || !(isStaffRole(current.role) || isAgencyRole(current.role))) {
    throw new AppError("UNAUTHENTICATED", "Please sign in to continue.");
  }
  if (current.userStatus !== "ACTIVE" || current.activationPending || current.mustChangePassword ||
      (current.agencyId && current.agencyStatus !== "ACTIVE") ||
      current.role !== actor.role || current.agencyId !== actor.agencyId ||
      (actor.credentialVersion !== undefined && current.credentialVersion !== actor.credentialVersion) ||
      (current.agencyId ? !isAgencyRole(current.role) : !isStaffRole(current.role))) {
    throw new AppError("UNAUTHENTICATED", "Please sign in to continue.");
  }
  return { ...actor, id: current.id, email: current.email, username: current.username, name: current.name,
    role: current.role, agencyId: current.agencyId, userStatus: current.userStatus,
    agencyStatus: current.agencyStatus, agencyName: current.agencyName, mustChangePassword: false,
    credentialVersion: current.credentialVersion,staffPermissions:current.staffPermissions };
}

/** Only qualified readers opt in; existing callers remain exclusive by default. */
export async function currentOperationActor(tx: IdentityTransaction, actor: AuthUser,mode:'read'|'write'='write'): Promise<AuthUser> {
  await lockIdentityState(tx,mode);
  const [row] = await tx.select({ user: users, agencyStatus: agencies.status, agencyName: agencies.legalName })
    .from(users).leftJoin(agencies, eq(users.agencyId, agencies.id)).where(eq(users.id, actor.id)).limit(1);
  const profile=row&&!row.user.agencyId?await readStaffProfile(tx,row.user.id):null;
  return verifiedActor(actor, row ? { id: row.user.id, name: row.user.name, email: row.user.email,
    username: profile?.username??row.user.username, role: row.user.role, agencyId: row.user.agencyId,
    userStatus: row.user.status, agencyStatus: row.agencyStatus, agencyName: row.agencyName,
    activationPending: row.user.activationPending, mustChangePassword: row.user.mustChangePassword,
    credentialVersion: row.user.credentialVersion,staffPermissions:profile?.staffPermissions??null } : undefined);
}

/** Native PostgreSQL operations keep identity validation on their existing client. */
export async function currentOperationActorPg(client: PoolClient, actor: AuthUser,mode:'read'|'write'='write'): Promise<AuthUser> {
  await client.query(mode==='write'?"select pg_advisory_xact_lock(1163087699)":"select pg_advisory_xact_lock_shared(1163087699)");
  const result = await client.query<CurrentIdentity>(`select u.id, u.name, u.email, coalesce(p.value->>'username',u.username) as username, u.role,
    u.agency_id as "agencyId", u.status as "userStatus", a.status as "agencyStatus", a.legal_name as "agencyName",
    u.activation_pending as "activationPending", u.must_change_password as "mustChangePassword",
    u.credential_version as "credentialVersion", p.value->'staffPermissions' as "staffPermissions"
    from ${qualifiedTable("users")} u left join ${qualifiedTable("agencies")} a on a.id=u.agency_id
    left join ${qualifiedTable('site_settings')} p on p.key=$2||u.id::text and u.agency_id is null where u.id=$1`, [actor.id,STAFF_PROFILE_PREFIX]);
  return verifiedActor(actor, result.rows[0]);
}
