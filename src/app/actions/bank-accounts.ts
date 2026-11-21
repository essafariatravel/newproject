"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { AppError } from "@/lib/types";
import { runAction } from "@/lib/action-helpers";
import { getUiLocale } from "@/lib/ui-i18n";
import { bankAccountCopy } from "@/lib/bank-accounts-copy";
import {
  addBankAccount, bankAccountInputSchema, removeBankAccount,
} from "@/lib/bank-accounts";

/** No user-supplied redirect or tenant identifier is accepted. */
export async function addBankAccountAction(formData: FormData): Promise<void> {
  await runAction("/admin/billing", async () => {
    const actor = await requireStaff();
    if (actor.role !== "SUPER_ADMIN" || actor.agencyId) {
      throw new AppError("FORBIDDEN", "Only the Super Admin can manage bank accounts.");
    }
    const copy = bankAccountCopy(await getUiLocale());
    const parsed = bankAccountInputSchema.safeParse({
      bankName: formData.get("bankName"),
      holderName: formData.get("holderName"),
      rib: formData.get("rib"),
    });
    if (!parsed.success) throw new AppError("INVALID_BANK_DETAILS", copy.invalid);
    try {
      await addBankAccount(actor, parsed.data);
    } catch (error) {
      if (error instanceof AppError && error.code === "DUPLICATE") throw new AppError(error.code, copy.duplicate);
      if (error instanceof AppError && error.code === "LIMIT") throw new AppError(error.code, copy.limit);
      throw error;
    }
    revalidatePath("/admin/billing");
    revalidatePath("/portal/wallet");
    return copy.added;
  });
}

export async function removeBankAccountAction(formData: FormData): Promise<void> {
  await runAction("/admin/billing", async () => {
    const actor = await requireStaff();
    if (actor.role !== "SUPER_ADMIN" || actor.agencyId) {
      throw new AppError("FORBIDDEN", "Only the Super Admin can manage bank accounts.");
    }
    const copy = bankAccountCopy(await getUiLocale());
    const id = formData.get("id");
    if (typeof id !== "string") throw new AppError("INVALID_ID", copy.missing);
    try {
      await removeBankAccount(actor, id);
    } catch (error) {
      if (error instanceof AppError && ["INVALID_ID", "NOT_FOUND"].includes(error.code)) {
        throw new AppError("NOT_FOUND", copy.missing);
      }
      throw error;
    }
    revalidatePath("/admin/billing");
    revalidatePath("/portal/wallet");
    return copy.removed;
  });
}
