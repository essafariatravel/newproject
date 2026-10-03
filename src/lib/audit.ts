import { db } from "@/lib/db";
import { auditLogs } from "@/db/schema";
import type { AuthUser } from "@/lib/types";
import { logErrorOnce, logEvent, pseudonymizeIdentifier } from "@/lib/observability";

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

    const critical = /(?:WALLET|TOPUP|ROLE|SUSPEND|REACTIVAT|DECISION|RECOVERY|SUPER_ADMIN|USER_(?:CREATED|UPDATED|DELETED)|AGENCY_(?:APPROVED|REJECTED|UPDATED))/i.test(input.action);
    if (critical) {
      logEvent({
        eventName: "security.audit_event",
        severity: "info",
        result: "succeeded",
        actorRole: input.actor?.role ?? null,
        tenantRef: pseudonymizeIdentifier(input.agencyId ?? input.actor?.agencyId),
        resourceType: input.entity,
        resourceRef: pseudonymizeIdentifier(input.entityId),
        metadata: { audit_action: input.action },
      });
    }
  } catch (err) {
    const critical = /(?:WALLET|TOPUP|ROLE|SUSPEND|REACTIVAT|DECISION|SUPER_ADMIN)/.test(input.action);
    logErrorOnce("audit.persistence_failed", err, {
      severity: critical ? "critical" : "error",
      classification: "BUSINESS_FAILURE",
      result: "technical_failed",
      actorRole: input.actor?.role ?? null,
      tenantRef: pseudonymizeIdentifier(input.agencyId ?? input.actor?.agencyId),
      resourceType: input.entity,
      metadata: { audit_action: input.action },
    });
  }
}
