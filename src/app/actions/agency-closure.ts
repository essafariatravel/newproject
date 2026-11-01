"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { closeAgency } from "@/lib/agency-closure";
import { agencyClosureCopy } from "@/lib/agency-closure-copy";
import { getUiLocale } from "@/lib/ui-i18n";
import { AppError } from "@/lib/types";

export interface ClosureState { closed?: boolean; error?: string }
export async function closeAgencyAction(_previous: ClosureState, form: FormData): Promise<ClosureState> {
  const t = agencyClosureCopy(await getUiLocale());
  try {
    const actor = await requireUser();
    const input = z.object({ agencyId: z.string().uuid(), confirmationName: z.string().max(512), currentPassword: z.string().max(200),
      retentionReference: z.string().trim().min(1).max(300), retainUntil: z.string().max(10),
      acceptObligations:z.preprocess(v=>v==='1',z.boolean()),responsibilityNote:z.string().trim().max(2000).optional() }).parse(Object.fromEntries(form));
    await closeAgency(actor, input);
    revalidatePath("/admin/agencies");
    revalidatePath(`/admin/agencies/${input.agencyId}`);
    revalidatePath("/admin");
    revalidatePath('/admin/users');
    revalidatePath('/admin/applications');
    return { closed: true };
  } catch (error) {
    if (error instanceof AppError) {
      if (error.code === "CLOSURE_TARGET_BLOCKED") return { error: t("blockedTarget") };
      if(error.code==='OBLIGATIONS_ACKNOWLEDGEMENT_REQUIRED')return {error:t('obligationError')};
      if(error.code==='CLOSURE_BLOCKED')return {error:t('integrityError')};
      if (error.code === "VALIDATION") return { error: t(error.message.startsWith("Enter the exact agency") ? "verification" : "policyError") };
      if (["UNAUTHENTICATED", "FORBIDDEN", "INVALID_CREDENTIALS"].includes(error.code)) return { error: t("verification") };
    }
    return { error: t("failure") };
  }
}
