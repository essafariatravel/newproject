/**
 * Safe error reporting for logs and diagnostics.
 *
 * PostgreSQL/driver errors never contain the password, but everything printed
 * into build logs or diagnostic endpoints is defensively stripped of anything
 * resembling a connection URI. Node can also reject with an AggregateError
 * (e.g. both IPv6 and IPv4 connection attempts refused), which carries an
 * empty `message` and the useful text in `errors[]`.
 */
const CONNECTION_URI_PATTERN = /postgres(?:ql)?:\/\/\S+/gi;

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
  return text.replace(CONNECTION_URI_PATTERN, "<redacted>").slice(0, 300);
}
