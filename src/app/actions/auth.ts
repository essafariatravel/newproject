"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/db/schema";
import { authenticate, createSession, destroySession, setSessionCookie } from "@/lib/auth";
import { isAgencyRole, type AuthUser, type Role } from "@/lib/types";
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
    return { error: err instanceof Error ? err.message : "Sign-in failed." };
  }
  const { token, expiresAt } = await createSession(user.id);
  await setSessionCookie(token, expiresAt);
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

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
  await recordAudit({
    actor: authUser,
    action: "USER_LOGIN",
    entity: "user",
    entityId: user.id,
    agencyId: user.agencyId,
    ipAddress: hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });
  redirect(isAgencyRole(user.role) ? "/portal" : "/admin");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
