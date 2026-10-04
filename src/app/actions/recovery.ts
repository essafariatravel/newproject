"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { AppError } from "@/lib/types";
import { closeRecoveryRequest, issueAccessToken, requestAccountRecovery, resetAccountFromToken } from "@/lib/account-recovery";
import { runAction } from "@/lib/action-helpers";
import { getUiLocale } from "@/lib/ui-i18n";
import { localizeError } from "@/lib/i18n-content";

export interface RecoveryState { message?: string; error?: string; link?: string; expiresAt?: string }

export async function requestRecoveryAction(_previous: RecoveryState, form: FormData): Promise<RecoveryState> {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  return { message: await requestAccountRecovery(String(form.get("identifier") ?? ""), ip) };
}

/** Serialized response shows the raw link once. It is never put in redirect/query/log/audit data. */
export async function generateAccessLinkAction(_previous: RecoveryState, form: FormData): Promise<RecoveryState> {
  try {
    const actor = await requireUser();
    const userId = z.string().uuid().parse(form.get("userId"));
    const requestId = form.get("requestId") ? z.string().uuid().parse(form.get("requestId")) : undefined;
    const purpose = form.get("purpose") === "ACTIVATION" ? "ACTIVATION" : "PASSWORD_RESET";
    const issued = await issueAccessToken(actor, userId, purpose, requestId);
    revalidatePath("/admin/recovery");
    return { link: `/reset-access/${issued.token}`, expiresAt: issued.expiresAt.toISOString(), message: "Copy this single-use link now and share it securely with the user. Previous links were revoked." };
  } catch (err) {
    return { error: localizeError(await getUiLocale(),err instanceof AppError ? err.message : "The access link could not be generated.") };
  }
}

export async function resetAccessAction(_previous: RecoveryState, form: FormData): Promise<RecoveryState> {
  const locale = await getUiLocale();
  const password = String(form.get("password") ?? "");
  if (password !== String(form.get("confirm") ?? "")) return { error: localizeError(locale,"The confirmation does not match the new password.") };
  try { await resetAccountFromToken(String(form.get("token") ?? ""), password); }
  catch (err) { return { error: localizeError(locale,err instanceof AppError ? err.message : "The password could not be updated. Please try again.") }; }
  redirect("/login?reset=complete");
}

export async function closeRecoveryAction(form: FormData): Promise<void> {
  await runAction("/admin/recovery", async () => {
    await closeRecoveryRequest(await requireUser(), z.string().uuid().parse(form.get("requestId")));
    revalidatePath("/admin/recovery");
    return "Recovery request closed.";
  });
}
