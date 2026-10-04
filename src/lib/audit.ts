import { db } from "@/lib/db";
import { safeErrorCode, safeErrorText } from "@/lib/safe-error";
import { auditLogs } from "@/db/schema";
import { AppError, type AuthUser } from "@/lib/types";

interface AuditInput {
  actor: AuthUser | null;
  action: string;
  entity: string;
  entityId?: string | null;
  agencyId?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}

async function persistAudit(input: AuditInput): Promise<void> {
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
}

function logAuditFailure(input: AuditInput, err: unknown): void {
  console.error("audit-log-failure", {
    action: input.action,
    entity: input.entity,
    code: safeErrorCode(err),
    error: safeErrorText(err),
  });
}

/** Persist an immutable audit record. Low-risk telemetry never throws into the caller's flow. */
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await persistAudit(input);
  } catch (err) {
    logAuditFailure(input, err);
  }
}

/**
 * Security-sensitive disclosure audit. Fail closed: callers must not release
 * private bytes/exports when the access evidence cannot be persisted.
 */
export async function recordAuditStrict(input: AuditInput): Promise<void> {
  try {
    await persistAudit(input);
  } catch (err) {
    logAuditFailure(input, err);
    throw new AppError("AUDIT_FAILED", "Security audit is temporarily unavailable.");
  }
}
