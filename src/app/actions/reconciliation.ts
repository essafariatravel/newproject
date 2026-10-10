"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { runAction } from "@/lib/action-helpers";
import { createLegacyReconciliationService } from "@/lib/legacy-reconciliation";
import { AppError } from "@/lib/types";
const service=createLegacyReconciliationService(pool);

export async function scanReconciliationAction() {
  await runAction("/admin/reconciliation",async()=>{
    await service.scan(await requireUser()); revalidatePath("/admin/reconciliation"); return "Reconciliation scan completed.";
  });
}
export async function recordReconciliationAction(form: FormData) {
  await runAction("/admin/reconciliation",async()=>{
    const outcome=String(form.get("outcome"));
    if (outcome!=="OWNER_DISPOSITION" && outcome!=="RESTORED") throw new AppError("VALIDATION","Choose a valid reconciliation outcome.");
    await service.disposition(await requireUser(),{issueId:String(form.get("issueId")),outcome,note:String(form.get("note")??"")});
    revalidatePath("/admin/reconciliation");return "Reconciliation note recorded.";
  });
}
