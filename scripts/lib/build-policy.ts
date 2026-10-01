/**
 * Build-time database safety policy.
 *
 * Branches listed here may be built as Vercel Previews, but the build itself
 * must never apply migrations, seed data, or run bootstrap DB verification.
 * Database changes for these branches are handled explicitly outside build.
 */
export const AUTOMATIC_DATABASE_CHANGE_PROTECTED_BRANCHES = [
  "preprod/essafaria-final-hardening",
  "design/essafaria-northstar",
  "codex/essafaria-premium-redesign",
  "codex/essafaria-product-excellence",
  "release/essafaria-rc-2026-09",
] as const;

export function automaticDatabaseChangesForbidden(branch: string | null | undefined): boolean {
  return (AUTOMATIC_DATABASE_CHANGE_PROTECTED_BRANCHES as readonly string[]).includes(branch ?? "");
}
