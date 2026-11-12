"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { signInWithPassword, createSession, destroySession, requirePasswordChangeSession, setSessionCookie, touchCurrentSession } from "@/lib/auth";
import { changeAccountPassword } from "@/lib/account-security";
import { assertPublicBotProtection, publicClientIp } from "@/lib/bot-protection";
import { consumeAuthRateLimit } from "@/lib/auth-rate-limit";
import { botProtectionError } from "@/lib/bot-protection-copy";
import { AppError, isAgencyRole } from "@/lib/types";
import type { ActionState } from "@/components/forms";
import { runAction } from "@/lib/action-helpers";
import { getUiLocale } from "@/lib/ui-i18n";
import { localizeError } from "@/lib/i18n-content";
import { safeErrorCode } from "@/lib/safe-error";
import { mfaEnforcementEnabled } from "@/lib/mfa-policy";
import { PasswordLoginLockedError } from "@/lib/login-lockout";
import { loginLockoutCopy } from "@/lib/login-lockout-copy";

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const locale = await getUiLocale();
  const fail = (message: string): ActionState => ({ error: localizeError(locale, message) });
  const email = String(formData.get("identifier") ?? formData.get("email") ?? "").trim().slice(0, 254);
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return fail("Enter your registered email and password.");
  }
  if (password.length > 200) {
    return fail("Invalid email or password.");
  }
  try { await assertPublicBotProtection(formData, "password_login", await headers()); }
  catch (error) { return { error: botProtectionError(locale, error) }; }
  let user;
  try {
    // These request budgets are independent of the agency password lock.
    // Preserve the original Production scopes, subjects and thresholds.
    const ip = publicClientIp(await headers());
    if (!ip) return fail("Service temporarily unavailable. Please try again.");
    const subject = email.includes("@") ? email.toLowerCase() : email.normalize("NFKC").toLowerCase();
    const ipAllowed = await consumeAuthRateLimit("login-ip", ip, 40, 15 * 60_000);
    const identityAllowed = await consumeAuthRateLimit("login-identity", subject, 10, 15 * 60_000);
    if (!ipAllowed || !identityAllowed) return fail("Sign-in is temporarily unavailable. Please try again later.");
    const session = await signInWithPassword(email, password);
    user = session.user;
    await setSessionCookie(session.token, session.expiresAt);
  } catch (err) {
    if (err instanceof PasswordLoginLockedError) {
      // This error can only follow a correct password and an active agency
      // identity rechecked inside the session transaction. Never infer it by email.
      return { error: loginLockoutCopy(locale).locked, retryAfterSeconds: err.retryAfterSeconds };
    }
    if (err instanceof AppError) return fail(err.message);
    console.error("[auth] Authentication unavailable.", safeErrorCode(err) ?? "unknown");
    return fail("Service temporarily unavailable. Please try again.");
  }
  // Phase 2.2 §11 — forced first password change before any shell page
  if ((user as { mustChangePassword?: boolean }).mustChangePassword) redirect("/change-password");
  if (!user.agencyId && mfaEnforcementEnabled()) redirect("/mfa");
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
    .min(12, "Use at least 12 characters, preferably a unique passphrase.")
    .max(200),
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
    try { await assertPublicBotProtection(formData, "password_change", await headers()); }
    catch (error) { throw new AppError("BOT_INVALID", botProtectionError(await getUiLocale(), error)); }
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
    if (user.mustChangePassword) successPath = isAgencyRole(user.role) ? "/portal" : mfaEnforcementEnabled() ? "/mfa" : "/admin";
    return "Password updated. Welcome!";
  }, { successPath: () => successPath });
}
