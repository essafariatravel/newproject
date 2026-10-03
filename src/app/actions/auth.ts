"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/db/schema";
import { z } from "zod";
import { authenticate, createSession, destroySession, requirePasswordChangeSession, setSessionCookie } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/crypto";
import { AppError, isAgencyRole, type AuthUser, type Role } from "@/lib/types";
import { recordAudit } from "@/lib/audit";
import type { ActionState } from "@/components/forms";
import { runAction } from "@/lib/action-helpers";
import { logErrorOnce, logEvent, pseudonymizeIdentifier, withObservabilityContext } from "@/lib/observability";

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const loginStartedAt = Date.now();
  const hdrs = await headers();
  const accountRef = pseudonymizeIdentifier(email.toLowerCase());
  const sourceRef = pseudonymizeIdentifier(
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  );

  return withObservabilityContext({ action: "auth.login" }, async () => {
    let user;
    try {
      user = await authenticate(email, password);
    } catch (err) {
      if (err instanceof AppError) {
        const safePrevention = ["INVALID_CREDENTIALS", "USER_SUSPENDED", "AGENCY_SUSPENDED"].includes(err.code);
        logEvent({
          eventName: safePrevention ? "auth.login.rejected" : "auth.login.technical_failed",
          severity: safePrevention ? "warning" : "error",
          classification: safePrevention ? "SAFE_PREVENTION" : "BUSINESS_FAILURE",
          result: safePrevention ? "rejected" : "technical_failed",
          errorCode: err.code,
          metadata: { account_ref: accountRef, source_ref: sourceRef },
          durationMs: Date.now() - loginStartedAt,
        });
        return { error: err.message };
      }
      logErrorOnce("auth.login.technical_failed", err, {
        severity: "error",
        classification: "BUSINESS_FAILURE",
        result: "technical_failed",
        metadata: { account_ref: accountRef, source_ref: sourceRef },
        durationMs: Date.now() - loginStartedAt,
      });
      return { error: "Service temporarily unavailable. Please try again." };
    }

    let token: string;
    let expiresAt: Date;
    try {
      const session = await createSession(user.id);
      token = session.token;
      expiresAt = session.expiresAt;
      await setSessionCookie(token, expiresAt);
    } catch (err) {
      logErrorOnce("auth.session.create_failed", err, {
        severity: "error",
        classification: "BUSINESS_FAILURE",
        result: "technical_failed",
        actorRole: user.role,
        tenantRef: pseudonymizeIdentifier(user.agencyId),
        metadata: { account_ref: accountRef, source_ref: sourceRef },
      });
      return { error: "Service temporarily unavailable. Please try again." };
    }

    try {
      await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
    } catch (err) {
      logErrorOnce("auth.last_login_update.failed", err, {
        severity: "warning",
        classification: "BUSINESS_FAILURE",
        result: "technical_failed",
        actorRole: user.role,
        tenantRef: pseudonymizeIdentifier(user.agencyId),
      });
    }

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as Role,
      agencyId: user.agencyId,
      userStatus: user.status,
      agencyStatus: null,
      agencyName: null,
    };

    await recordAudit({
      actor: authUser,
      action: "USER_LOGIN",
      entity: "user",
      entityId: user.id,
      agencyId: user.agencyId,
      ipAddress: hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    });

    logEvent({
      eventName: "auth.login.succeeded",
      result: "succeeded",
      actorRole: user.role,
      tenantRef: pseudonymizeIdentifier(user.agencyId),
      metadata: { account_ref: accountRef, source_ref: sourceRef },
      durationMs: Date.now() - loginStartedAt,
    });

    if ((user as { mustChangePassword?: boolean }).mustChangePassword) {
      redirect("/change-password");
    }
    redirect(isAgencyRole(user.role) ? "/portal" : "/admin");
  });
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}

/* ---------------- Phase 2.2 §11 — forced first password change ---------------- */

const changePasswordSchema = z.object({
  current: z.string().min(1, "Enter your current (temporary) password."),
  password: z
    .string()
    .min(10, "Password must be at least 10 characters.")
    .max(200)
    .refine((v) => /[a-z]/i.test(v) && /\d/.test(v), "Use letters AND digits in the new password."),
  confirm: z.string(),
});

/**
 * The ONLY action allowed while `mustChangePassword` is set
 * (requireUser() blocks everything else; this one uses the bypass session
 * fetcher, which itself refuses when no change is pending).
 * The new hash is stored, the flag is cleared, and a PASSWORD_CHANGED audit
 * row records the actor + timestamp — never any secret material.
 */
export async function changePasswordAction(formData: FormData): Promise<void> {
  await runAction("/change-password", async () => {
    const user = await requirePasswordChangeSession();
    const parsed = changePasswordSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) throw new AppError("VALIDATION", parsed.error.issues[0]?.message ?? "Check the form values.");
    if (parsed.data.password !== parsed.data.confirm) {
      throw new AppError("VALIDATION", "The confirmation does not match the new password.");
    }
    if (parsed.data.password === parsed.data.current) {
      throw new AppError("VALIDATION", "Choose a different password than the temporary one.");
    }
    const rows = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    const me = rows[0];
    if (!me) throw new AppError("NOT_FOUND", "User not found.");
    const match = await verifyPassword(parsed.data.current, me.passwordHash);
    if (!match) throw new AppError("UNAUTHENTICATED", "Current password is incorrect.");
    const passwordHash = await hashPassword(parsed.data.password);
    await db
      .update(users)
      .set({ passwordHash, mustChangePassword: false, updatedAt: new Date() })
      .where(eq(users.id, user.id));
    await recordAudit({
      actor: { ...user, mustChangePassword: false },
      action: "PASSWORD_CHANGED",
      entity: "user",
      entityId: user.id,
      agencyId: user.agencyId,
      metadata: { forced: true },
    });
    return "Password updated. Welcome!";
  });
}
