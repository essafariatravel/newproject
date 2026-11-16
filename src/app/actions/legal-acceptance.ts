"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { createLegalAcceptanceService } from "@/lib/legal-acceptance";
import { AppError } from "@/lib/types";

const input = z.object({
  documentType: z.enum(["terms_b2b", "privacy_b2b", "commercial_b2b", "staff_confidentiality"]),
  locale: z.enum(["fr", "en", "ar"]),
  legalVersionId: z.string().uuid(),
  contentSha256: z.string().regex(/^[a-f0-9]{64}$/),
  explicit: z.literal("on"),
});
export async function acceptLegalAction(form: FormData): Promise<void> {
  // Authenticate anew for every action, never use a captured page user or client tenant.
  const actor = await requireUser();
  const parsed = input.safeParse(Object.fromEntries(form));
  if (!parsed.success) redirect("/legal/acceptances?result=invalid");
  const value = parsed.data;
  let result = "saved";
  try {
    await createLegalAcceptanceService(pool).record(actor, { ...value, explicit: true,
      method: value.documentType === "privacy_b2b" ? "ACKNOWLEDGEMENT" : "EXPLICIT_CHECKBOX" });
  } catch (error) {
    // Do not log request fields, document bodies or raw database exceptions.
    result = error instanceof AppError && error.code === "LEGAL_CHANGED" ? "changed" : "unavailable";
  }
  redirect(`/legal/acceptances?lang=${value.locale}&result=${result}`);
}
