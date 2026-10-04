"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { authenticate, createSession, destroySession, requirePasswordChangeSession, setSessionCookie, touchCurrentSession } from "@/lib/auth";
import { changeAccountPassword } from "@/lib/account-security";
import { consumeAuthRateLimit } from "@/lib/auth-rate-limit";
import { AppError, isAgencyRole } from "@/lib/types";
import type { ActionState } from "@/components/forms";
import { runAction } from "@/lib/action-helpers";
import { getUiLocale } from "@/lib/ui-i18n";
import { localizeError } from "@/lib/i18n-content";
import { safeErrorCode } from "@/lib/safe-error";

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const locale = await getUiLocale();
  const fail = (message: string): ActionState => ({ error: localizeError(locale, message) });
  const email = String(formData.get("identifier") ?? formData.get("email") ?? "").trim().slice(0, 254);
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return fail("Enter your username or staff email and password.");
  }
  let user;
  try {
    const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const ipAllowed = await consumeAuthRateLimit("login-ip", ip, 40, 15 * 60_000);
    const accountAllowed = await consumeAuthRateLimit("login-identity", email.includes("@") ? email.toLowerCase() : email.normalize("NFKC").toLowerCase(), 10, 15 * 60_000);
    if (!ipAllowed || !accountAllowed) return fail("Sign-in is temporarily unavailable. Please try again later.");
    user = await authenticate(email, password);
  } catch (err) {
    // Never expose raw database errors (e.g. Failed query: select ... from users) to the user.
    if (err instanceof AppError) {
      return fail(err.message);
    }
    console.error("[auth] Authentication unavailable.", safeErrorCode(err) ?? "unknown");
    return fail("Service temporarily unavailable. Please try again.");
  }
  let token: string;
  let expiresAt: Date;
  try {
    const session = await createSession(user.id, { expectedCredentialVersion: user.credentialVersion, auditLogin: true });
    token = session.token;
    expiresAt = session.expiresAt;
    await setSessionCookie(token, expiresAt);
  } catch (err) {
    console.error("[auth] Session creation unavailable.", safeErrorCode(err) ?? "unknown");
    return fail("Service temporarily unavailable. Please try again.");
  }
  // Phase 2.2 §11 — forced first password change before any shell page
  if ((user as { mustChangePassword?: boolean }).mustChangePassword) redirect("/change-password");
  redirect(isAgencyRole(user.role) ? "/portal" : "/admin");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}

/** Called only by the shell's real user-interaction timer, never background polls. */
export async function touchSessionAction(): Promise<{ expired: boolean }> {
  return { expired: !await touchCurrentSession() };
}

/* ---------------- Phase 2.2 §11 — forced first password change ---------------- */

const changePasswordSchema = z.object({
  current: z.string().min(1, "Enter your current password."),
  password: z
    .string()
    .min(10, "Password must be at least 10 characters.")
    .max(200)
    .refine((v) => /[a-z]/i.test(v) && /\d/.test(v), "Use letters AND digits in the new password."),
  confirm: z.string(),
});

/**
 * The ONLY action allowed while `mustChangePassword` is set
 * (requireUser() blocks other protected mutations; this action accepts both
 * normal password changes and the required first password change).
 * The new hash is stored, the flag is cleared, and a PASSWORD_CHANGED audit
 * row records the actor + timestamp — never any secret material.
 */
export async function changePasswordAction(formData: FormData): Promise<void> {
  let successPath = "/change-password";
  await runAction("/change-password", async () => {
    const user = await requirePasswordChangeSession();
    const parsed = changePasswordSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) throw new AppError("VALIDATION", parsed.error.issues[0]?.message ?? "Check the form values.");
    if (parsed.data.password !== parsed.data.confirm) {
      throw new AppError("VALIDATION", "The confirmation does not match the new password.");
    }
    if (parsed.data.password === parsed.data.current) {
      throw new AppError("VALIDATION", "Choose a different password.");
    }
    const version = await changeAccountPassword(user, parsed.data.current, parsed.data.password);
    const session = await createSession(user.id, { expectedCredentialVersion: version });
    await setSessionCookie(session.token, session.expiresAt);
    if (user.mustChangePassword) successPath = isAgencyRole(user.role) ? "/portal" : "/admin";
    return "Password updated. Welcome!";
  }, { successPath: () => successPath });
}
