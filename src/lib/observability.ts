import { AsyncLocalStorage } from "node:async_hooks";
import { createHmac, randomUUID } from "node:crypto";
import { AppError } from "@/lib/types";
import { redactSensitiveText, safeErrorCode, safeErrorText } from "@/lib/safe-error";

export type ObservabilitySeverity = "info" | "warning" | "error" | "critical";
export type ObservabilityClassification =
  | "SAFE_PREVENTION"
  | "BUSINESS_FAILURE"
  | "DATA_INTEGRITY_FAILURE";

interface ObservabilityContext {
  requestId: string;
  action?: string | null;
  actorRole?: string | null;
  tenantRef?: string | null;
}

export interface ObservabilityEvent {
  eventName: string;
  severity?: ObservabilitySeverity;
  classification?: ObservabilityClassification;
  result?: string | null;
  route?: string | null;
  action?: string | null;
  durationMs?: number | null;
  actorRole?: string | null;
  tenantRef?: string | null;
  resourceType?: string | null;
  resourceRef?: string | null;
  errorCode?: string | null;
  metadata?: Record<string, unknown> | null;
}

const contextStore = new AsyncLocalStorage<ObservabilityContext>();
const observedErrors = new WeakSet<object>();
const FORBIDDEN_FIELD = /(?:^|_)(?:password|passwd|authorization|cookie|session_token|access_token|refresh_token|reset_token|secret|service_role|database_url|signed_url|document_data|file_data|passport|national_id|email|phone|address|request_body|response_body|content)(?:$|_)/i;

function safeScalar(value: unknown): unknown {
  if (typeof value === "string") return redactSensitiveText(value);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  return value;
}

function sanitizeObject(value: unknown, depth = 0): unknown {
  if (depth > 4) return "<truncated>";
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeObject(item, depth + 1));
  if (!value || typeof value !== "object") return safeScalar(value);

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_FIELD.test(key)) continue;
    if (child === undefined) continue;
    out[key] = sanitizeObject(child, depth + 1);
  }
  return out;
}

export function pseudonymizeIdentifier(value: string | null | undefined): string | null {
  if (!value) return null;
  const key = process.env.TELEMETRY_PSEUDONYMIZATION_KEY;
  if (!key) return null;
  return createHmac("sha256", key).update(value).digest("hex").slice(0, 24);
}

export function currentObservabilityContext(): Readonly<ObservabilityContext> | null {
  return contextStore.getStore() ?? null;
}

export async function withObservabilityContext<T>(
  context: Partial<ObservabilityContext>,
  fn: () => Promise<T>,
): Promise<T> {
  const parent = contextStore.getStore();
  const merged: ObservabilityContext = {
    requestId: context.requestId ?? parent?.requestId ?? randomUUID(),
    action: context.action ?? parent?.action ?? null,
    actorRole: context.actorRole ?? parent?.actorRole ?? null,
    tenantRef: context.tenantRef ?? parent?.tenantRef ?? null,
  };
  return contextStore.run(merged, fn);
}

export function logEvent(event: ObservabilityEvent): void {
  const ctx = contextStore.getStore();
  const severity = event.severity ?? "info";
  const payload = sanitizeObject({
    timestamp: new Date().toISOString(),
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
    release_sha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    request_id: ctx?.requestId ?? null,
    event_name: event.eventName,
    severity,
    classification: event.classification ?? null,
    route: event.route ?? null,
    action: event.action ?? ctx?.action ?? null,
    result: event.result ?? null,
    error_code: event.errorCode ?? null,
    duration_ms: event.durationMs ?? null,
    actor_role: event.actorRole ?? ctx?.actorRole ?? null,
    tenant_ref: event.tenantRef ?? ctx?.tenantRef ?? null,
    resource_type: event.resourceType ?? null,
    resource_ref: event.resourceRef ?? null,
    metadata: event.metadata ?? null,
  }) as Record<string, unknown>;

  const line = JSON.stringify(payload);
  if (severity === "critical" || severity === "error") console.error(line);
  else if (severity === "warning") console.warn(line);
  else process.stdout.write(`${line}\n`);
}

export function logErrorOnce(
  eventName: string,
  error: unknown,
  event: Omit<ObservabilityEvent, "eventName" | "errorCode"> = {},
): void {
  if (error && typeof error === "object") {
    if (observedErrors.has(error)) return;
    observedErrors.add(error);
  }
  const appCode = error instanceof AppError ? error.code : null;
  logEvent({
    ...event,
    eventName,
    errorCode: appCode ?? safeErrorCode(error),
    metadata: {
      ...(event.metadata ?? {}),
      error_name: error instanceof Error ? error.name : typeof error,
      error_text: error instanceof AppError ? undefined : safeErrorText(error),
    },
  });
}
