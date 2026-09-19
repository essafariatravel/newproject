"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/db/schema";
import { authenticate, createSession, destroySession, setSessionCookie } from "@/lib/auth";
import { AppError, isAgencyRole, type AuthUser, type Role } from "@/lib/types";
import { recordAudit } from "@/lib/audit";
import type { ActionState } from "@/components/forms";

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return { error: "Enter your email and password." };
  }
  let user;
  try {
    user = await authenticate(email, password);
  } catch (err) {
    // Never expose raw database errors (e.g. Failed query: select ... from users) to the user.
    if (err instanceof AppError) {
      return { error: err.message };
    }
    console.error("[auth] loginAction authenticate failed", err);
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
    console.error("[auth] createSession failed", err);
    return { error: "Service temporarily unavailable. Please try again." };
  }
  try {
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  } catch (err) {
    // Non-critical: login should succeed even if last_login_at update fails.
    console.error("[auth] lastLoginAt update failed", err);
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
  const hdrs = await headers();
  try {
    await recordAudit({
      actor: authUser,
      action: "USER_LOGIN",
      entity: "user",
      entityId: user.id,
      agencyId: user.agencyId,
      ipAddress: hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    });
  } catch (err) {
    console.error("[auth] recordAudit failed", err);
    // Not fatal for login.
  }
  redirect(isAgencyRole(user.role) ? "/portal" : "/admin");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
