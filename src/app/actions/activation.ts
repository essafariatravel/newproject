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
    ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  } catch {
    // outside a request scope (tests)
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
    console.error("[activation] activateAccount failed", err);
    return { error: copy.errors.generic };
  }

  try {
    const session = await createSession(user.id);
    await setSessionCookie(session.token, session.expiresAt);
  } catch (err) {
    console.error("[activation] session creation failed", err);
    redirect("/login");
  }
  redirect(isAgencyRole(user.role as Role) ? "/portal" : "/admin");
}
