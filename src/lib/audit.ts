import { db } from "@/lib/db";
import type { PoolClient } from "pg";
import { qualifiedTable } from "@/lib/database-schema";
import { auditLogs } from "@/db/schema";
import type { AuthUser } from "@/lib/types";

export interface AuditInput {
  actor: AuthUser | null;
  action: string;
  entity: string;
  entityId?: string | null;
  agencyId?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}

export type AuditTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Sensitive mutations supply their transaction; failed audits abort the commit. */
export async function recordAudit(input: AuditInput, executor: Pick<typeof db, "insert"> = db): Promise<void> {
    await executor.insert(auditLogs).values({
      actorId: input.actor?.id ?? null,
      actorEmail: input.actor?.email ?? null,
      actorRole: input.actor?.role ?? null,
      agencyId: input.agencyId ?? input.actor?.agencyId ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      metadata: input.actor ? { ...input.metadata, actorName: input.actor.name, actorUsername: input.actor.username } : input.metadata ?? null,
      ipAddress: input.ipAddress ?? null,
    });
}

/** Native PostgreSQL operations retain audit atomicity without a second pool connection. */
export async function recordAuditPg(client: PoolClient, input: AuditInput): Promise<void> {
  await client.query(`insert into ${qualifiedTable("audit_logs")}
    (actor_id, actor_email, actor_role, agency_id, action, entity, entity_id, metadata, ip_address)
    values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`, [input.actor?.id ?? null, input.actor?.email ?? null,
    input.actor?.role ?? null, input.agencyId ?? input.actor?.agencyId ?? null, input.action, input.entity,
    input.entityId ?? null, input.actor ? JSON.stringify({ ...input.metadata, actorName: input.actor.name, actorUsername: input.actor.username })
      : input.metadata ? JSON.stringify(input.metadata) : null, input.ipAddress ?? null]);
}
