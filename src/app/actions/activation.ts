"use server";

/**
 * Account activation — the secure set-password flow for newly approved
 * Agency Admins. No plaintext password is ever created or transmitted by
 * the platform: the single-use, expiring, hashed token is the only way in.
 */
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { activateAccount } from "@/lib/registrations";
import { createSession, setSessionCookie } from "@/lib/auth";
import { registrationCopy, resolveLocale } from "@/lib/i18n";
import { AppError, isAgencyRole, type Role } from "@/lib/types";
import { assertPublicBotProtection, publicClientIp } from "@/lib/bot-protection";
import { botProtectionError } from "@/lib/bot-protection-copy";
import { passwordLoginKey } from "@/lib/login-lockout";
import { safeErrorCode } from "@/lib/safe-error";

export interface ActivationFormState {
  error?: string;
}

export async function activateAccountAction(
  _prev: ActivationFormState,
  formData: FormData,
): Promise<ActivationFormState> {
  const locale = resolveLocale(formData.get("locale"));
  const copy = registrationCopy(locale);
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("passwordConfirm") ?? "");

  if (password.length < 10 || password.length > 200) {
    return { error: copy.activation.passwordTooShort };
  }
  if (password !== confirm) {
    return { error: copy.activation.passwordMismatch };
  }

  let ip: string | null = null;
  try {
    const hdrs = await headers();
    await assertPublicBotProtection(formData, "account_activation", hdrs);
    ip = publicClientIp(hdrs);
  } catch (error) {
    return { error: botProtectionError(locale, error) };
  }

  let user;
  try {
    user = await activateAccount(token, password, ip);
  } catch (err) {
    if (err instanceof AppError) {
      return {
        error:
          err.code === "PASSWORD_POLICY"
            ? copy.activation.passwordTooShort
            : copy.activation.invalidTitle,
      };
    }
    console.error("[activation] activateAccount failed", safeErrorCode(err) ?? "unknown");
    return { error: copy.errors.generic };
  }

  try {
    const session = await createSession(user.id, {
      expectedCredentialVersion: user.credentialVersion, passwordLoginKey: passwordLoginKey(user.email),
    });
    await setSessionCookie(session.token, session.expiresAt);
  } catch (err) {
    if (!(err instanceof AppError)) console.error("[activation] session creation failed", safeErrorCode(err) ?? "unknown");
    redirect("/login");
  }
  redirect(isAgencyRole(user.role as Role) ? "/portal" : "/admin");
}
