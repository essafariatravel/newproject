import { eq } from "drizzle-orm";
import type { PoolClient } from "pg";
import { agencies, users } from "@/db/schema";
import { lockIdentityState, type IdentityTransaction } from "@/lib/account-security";
import { qualifiedTable } from "@/lib/database-schema";
import { AppError, isAgencyRole, isStaffRole, type AuthUser } from "@/lib/types";

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
    credentialVersion: current.credentialVersion };
}

/** Take this guard BEFORE tenant/dossier locks; identity mutations use the same lock. */
export async function currentOperationActor(tx: IdentityTransaction, actor: AuthUser): Promise<AuthUser> {
  await lockIdentityState(tx);
  const [row] = await tx.select({ user: users, agencyStatus: agencies.status, agencyName: agencies.legalName })
    .from(users).leftJoin(agencies, eq(users.agencyId, agencies.id)).where(eq(users.id, actor.id)).limit(1);
  return verifiedActor(actor, row ? { id: row.user.id, name: row.user.name, email: row.user.email,
    username: row.user.username, role: row.user.role, agencyId: row.user.agencyId,
    userStatus: row.user.status, agencyStatus: row.agencyStatus, agencyName: row.agencyName,
    activationPending: row.user.activationPending, mustChangePassword: row.user.mustChangePassword,
    credentialVersion: row.user.credentialVersion } : undefined);
}

/** Native PostgreSQL operations keep identity validation on their existing client. */
export async function currentOperationActorPg(client: PoolClient, actor: AuthUser): Promise<AuthUser> {
  await client.query("select pg_advisory_xact_lock(1163087699)");
  const result = await client.query<CurrentIdentity>(`select u.id, u.name, u.email, u.username, u.role,
    u.agency_id as "agencyId", u.status as "userStatus", a.status as "agencyStatus", a.legal_name as "agencyName",
    u.activation_pending as "activationPending", u.must_change_password as "mustChangePassword",
    u.credential_version as "credentialVersion"
    from ${qualifiedTable("users")} u left join ${qualifiedTable("agencies")} a on a.id=u.agency_id where u.id=$1`, [actor.id]);
  return verifiedActor(actor, result.rows[0]);
}
