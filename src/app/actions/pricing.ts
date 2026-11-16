"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction } from "@/lib/action-helpers";
import { requireStaff } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { applyPriceAdjustment } from "@/lib/price-adjustments";
import { AppError } from "@/lib/types";
import { recordAudit } from "@/lib/audit";

const schema = z.object({
  applicationId: z.string().uuid(),
  type: z.enum(["DISCOUNT", "SURCHARGE", "REFUND"]),
  amount: z.string().trim(),
  reason: z.string().trim().min(8, "A reason of at least 8 characters is mandatory."),
  idempotencyKey: z.string().trim().max(120).optional().or(z.literal("")),
});

/**
 * Phase 2.2 §17 — staff price adjustment. Server-side authoritative:
 * permission check → one authoritative Zod input model → compensation in a
 * single DB transaction (in the service). Client-computed effective prices
 * are NEVER trusted; no currency input exists (submission currency rules).
 * The explicit confirmation checkbox is required as an anti-misclick guard.
 */
export async function applyPriceAdjustmentAction(formData: FormData): Promise<void> {
  const applicationId = String(formData.get("applicationId") ?? "");
  await runAction(`/admin/applications/${applicationId}`, async () => {
    const staff = await requireStaff();
    requirePermission(staff, "applications.pricing.adjust");
    if (formData.get("confirm") !== "on") {
      throw new AppError("VALIDATION", "Please tick the confirmation box — the adjustment is immediately loaded to the agency wallet.");
    }
    const data = schema.parse(Object.fromEntries(formData));
    const result = await applyPriceAdjustment({
      applicationId: data.applicationId,
      actor: staff,
      type: data.type,
      amount: data.amount,
      reason: data.reason,
      idempotencyKey: data.idempotencyKey || null,
    });
    revalidatePath(`/admin/applications/${data.applicationId}`);
    revalidatePath("/admin/wallets");
    if (result.replayed) {
      // idempotency replay — audit the retry for full trace (spec: duplicate/refund-retry rejected)
      await recordAudit({
        actor: staff,
        action: "PRICE_ADJUSTMENT_REPLAYED",
        entity: "application",
        entityId: data.applicationId,
        metadata: { adjustmentId: result.adjustmentId, idempotencyKey: data.idempotencyKey || null },
      });
      return "This adjustment was already applied — the wallet was NOT changed again.";
    }
    return `Adjustment applied: effective price is now ${result.effectiveAfter} (was ${result.effectiveBefore}).`;
  });
}
