import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { isAgencyRole, type AuthUser } from "@/lib/types";

/**
 * Page-level auth: redirects to /login instead of throwing (server
 * components and layouts render in parallel, so a redirect is the correct
 * denial mechanism at page level). Server actions keep using requireUser().
 */
export async function pageUser(): Promise<AuthUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/** Agency-portal page auth: staff are sent to the Back Office. */
export async function portalPageUser(): Promise<AuthUser & { agencyId: string }> {
  const user = await pageUser();
  if (!isAgencyRole(user.role) || !user.agencyId) redirect("/admin");
  return user as AuthUser & { agencyId: string };
}

/** Back-office page auth: agency users are sent to their portal. */
export async function adminPageUser(): Promise<AuthUser> {
  const user = await pageUser();
  if (isAgencyRole(user.role)) redirect("/portal");
  return user;
}
