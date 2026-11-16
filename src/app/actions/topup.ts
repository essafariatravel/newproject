"use server";

/**
 * Wallet top-up request actions (§10).
 *
 * Two entry points, one service:
 *   - agency: raise a request for its OWN agency only,
 *   - staff:  credit or reject a pending request (SUPER_ADMIN / ADMIN / ACCOUNTING).
 *
 * The agency entry point never takes an agency id from the client — the tenant
 * comes from the session. The staff entry point can never create money: it
 * delegates to processTopupRequest(), which credits the wallet through the
 * shared wallet primitive and links the resulting ledger row.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff, requireUser } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { AppError, MAX_UPLOAD_BYTES } from "@/lib/types";
import { getUiLocale } from "@/lib/ui-i18n";
import { contentT } from "@/lib/i18n-content";
import { runAction } from "@/lib/action-helpers";
import { createTopupRequest, processTopupRequest, TOPUP_PROCESSING_ROLES } from "@/lib/topup";

const idSchema = z.string().uuid("Invalid identifier.");

const requestSchema = z.object({
  amount: z.coerce.number().positive("Enter an amount greater than zero."),
  note: z.string().trim().max(500).optional().or(z.literal("")),
  idempotencyKey: z.string().uuid("Refresh this form before submitting."),
});

export async function requestTopupAction(formData: FormData): Promise<void> {
  const back = String(formData.get("back") ?? "/portal/wallet");
  await runAction(back, async () => {
    const user = await requireUser();
    if (!user.agencyId || user.role !== "AGENCY_ADMIN") {
      throw new AppError("FORBIDDEN", "Only your agency administrator can request a wallet top-up.");
    }
    const data = requestSchema.parse({
      amount: formData.get("amount"),
      note: formData.get("note") ?? "",
      idempotencyKey: formData.get("idempotencyKey"),
    });
    const file = formData.get("proof");
    if (!(file instanceof File) || file.size <= 0) throw new AppError("NO_FILE", "Upload your bank transfer receipt.");
    if (file.size > MAX_UPLOAD_BYTES) throw new AppError("FILE_TOO_LARGE", "Files must be 2 MB or smaller.");
    await createTopupRequest({
      agencyId: user.agencyId,
      amount: data.amount,
      note: data.note || null,
      actor: user,
      idempotencyKey: data.idempotencyKey,
      proof: { name: file.name, type: file.type, size: file.size, data: Buffer.from(await file.arrayBuffer()) },
    });
    revalidatePath("/portal/wallet");
    revalidatePath("/admin/billing");
    return contentT(await getUiLocale())("Top-up request sent. You will be notified once it is processed.");
  });
}

const processSchema = z.object({
  requestId: idSchema,
  decision: z.enum(["CREDIT", "REJECT"]),
  amount: z.coerce.number().positive().optional(),
  decisionNote: z.string().trim().max(500).optional().or(z.literal("")),
});

export async function processTopupAction(formData: FormData): Promise<void> {
  const back = String(formData.get("back") ?? "/admin/billing");
  await runAction(back, async () => {
    const staff = await requireStaff();
    requirePermission(staff, "wallet.adjust");
    if (!TOPUP_PROCESSING_ROLES.includes(staff.role as (typeof TOPUP_PROCESSING_ROLES)[number])) {
      throw new AppError("FORBIDDEN", "Your role cannot process wallet top-ups.");
    }
    const rawAmount = formData.get("amount");
    const data = processSchema.parse({
      requestId: formData.get("requestId"),
      decision: formData.get("decision"),
      amount: rawAmount === null || rawAmount === "" ? undefined : rawAmount,
      decisionNote: formData.get("decisionNote") ?? "",
    });
    const result = await processTopupRequest({
      requestId: data.requestId,
      actor: staff,
      decision: data.decision,
      decisionNote: data.decisionNote || null,
      amount: data.decision === "CREDIT" ? data.amount : undefined,
    });
    revalidatePath("/admin/billing");
    revalidatePath("/portal/wallet");
    return contentT(await getUiLocale())(result.status === "PROCESSED"
      ? "Top-up credited. The agency has been notified."
      : "Top-up rejected. The agency has been notified.");
  });
}
