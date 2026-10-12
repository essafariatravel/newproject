/** Normalize a user-supplied redirect target to a same-origin path only. */
export function safeLocalRedirectPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw.startsWith("/")) return null;
  try {
    const base = "https://essafaria.invalid";
    const parsed = new URL(raw, base);
    if (parsed.origin !== base) return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}
