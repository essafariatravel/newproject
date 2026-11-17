import type { AuthUser } from "@/lib/types";

export const STAFF_PUSH_ROLES = ["SUPER_ADMIN", "ADMIN", "VISA_AGENT", "ACCOUNTING"] as const;

/** Staff-only. Tenant accounts can never subscribe, even if role strings are malformed. */
export function isPushEligible(user: Pick<AuthUser, "role" | "agencyId" | "mustChangePassword">): boolean {
  return !user.agencyId && !user.mustChangePassword &&
    (STAFF_PUSH_ROLES as readonly string[]).includes(user.role);
}

/** Only staff internal, same-origin paths may be opened from the lock screen. */
export function safeStaffPushLink(link: string | null): string {
  if (!link || !/^\/admin(?:\/|$)/.test(link) || link.startsWith("//") ||
      link.includes("\\") || /[\r\n]/.test(link)) return "/admin/notifications";
  try {
    const url = new URL(link, "https://visa.essafariavoyages.com");
    return url.origin === "https://visa.essafariavoyages.com" &&
      /^\/admin(?:\/|$)/.test(url.pathname)
      ? url.pathname : "/admin/notifications";
  } catch { return "/admin/notifications"; }
}
