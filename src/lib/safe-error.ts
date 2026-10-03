/**
 * Privacy-first error sanitization for diagnostics and telemetry.
 *
 * Never emit raw credentials, authorization material, signed URLs, request
 * bodies, or obvious personal identifiers. User-facing AppError messages are
 * deliberately NOT used by observability; callers should log stable codes.
 */
const CONNECTION_URI_PATTERN = /(?:postgres(?:ql)?|https?):\/\/[^\s"']+/gi;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi;
const JWT_PATTERN = /\b[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/g;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const IPV4_PATTERN = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const MANAGED_DB_HOST_PATTERN = /\b[a-z0-9.-]+\.(?:supabase\.co|supabase\.com|neon\.tech|amazonaws\.com)\b/gi;
const FILE_PATH_PATTERN = /(?:[A-Za-z]:\\(?:[^\\\s"']+\\)*[^\\\s"']+|\/(?:tmp|var|home|mnt|usr|opt|srv|root|etc|vercel|workspace)(?:\/[^\/\s"']+)+)/g;
const SENSITIVE_QUERY_PATTERN = /([?&](?:token|access_token|refresh_token|signature|sig|secret|key|apikey|api_key|code)=)[^&\s"']+/gi;
const SENSITIVE_ASSIGNMENT_PATTERN =
  /\b(password|passwd|authorization|cookie|session|token|secret|service[_-]?role[_-]?key|database[_-]?url)\s*[:=]\s*("[^"]*"|'[^']*'|[^,;\s]+)/gi;
const PARAMS_PATTERN = /\bparams?\s*:\s*(\[[^\n]*\]|\{[^\n]*\})/gi;

/** Scrub a free-form string before it reaches logs or diagnostic responses. */
export function redactSensitiveText(value: string): string {
  return value
    .replace(CONNECTION_URI_PATTERN, "<redacted-uri>")
    .replace(BEARER_PATTERN, "Bearer <redacted>")
    .replace(JWT_PATTERN, "<redacted-token>")
    .replace(SENSITIVE_QUERY_PATTERN, "$1<redacted>")
    .replace(SENSITIVE_ASSIGNMENT_PATTERN, (_match, key: string) => `${key}=<redacted>`)
    .replace(PARAMS_PATTERN, "params: <redacted>")
    .replace(EMAIL_PATTERN, "<redacted-email>")
    .replace(IPV4_PATTERN, "<redacted-ip>")
    .replace(UUID_PATTERN, "<redacted-id>")
    .replace(MANAGED_DB_HOST_PATTERN, "<redacted-host>")
    .replace(FILE_PATH_PATTERN, "<redacted-path>")
    .slice(0, 500);
}

export function safeErrorCode(error: unknown): string | null {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return typeof code === "string" && code.length > 0 ? code : null;
}

export function safeErrorText(error: unknown): string {
  const err = error as
    | (Error & { errors?: unknown[]; syscall?: string; address?: string; port?: number })
    | null;
  let text: string = err?.message ?? "";
  if (!text && Array.isArray(err?.errors) && err.errors.length > 0) {
    text = err.errors
      .map((inner) => (inner as Error | null)?.message ?? String(inner))
      .filter(Boolean)
      .join("; ");
  }
  if (!text) {
    text = [err?.syscall, safeErrorCode(error), err?.address, err?.port].filter(Boolean).join(" ");
  }
  if (!text) text = String(error ?? "");
  return redactSensitiveText(text);
}
