import { db } from "@/lib/db";
import { auditLogs } from "@/db/schema";
import type { AuthUser } from "@/lib/types";

interface AuditInput {
  actor: AuthUser | null;
  action: string;
  entity: string;
  entityId?: string | null;
  agencyId?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}

/** Persist an immutable audit record. Never throws into the caller's flow. */
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      actorId: input.actor?.id ?? null,
      actorEmail: input.actor?.email ?? null,
      actorRole: input.actor?.role ?? null,
      agencyId: input.agencyId ?? input.actor?.agencyId ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      metadata: input.metadata ?? null,
      ipAddress: input.ipAddress ?? null,
    });
  } catch (err) {
    console.error("audit-log-failure", { action: input.action, entity: input.entity, err });
  }
}
