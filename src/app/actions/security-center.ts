"use server";
import { requireStaff } from "@/lib/auth";
import { resetMfa } from "@/lib/mfa";
import { revokeSession } from "@/lib/session-security";
import { runAction } from "@/lib/action-helpers";
import { z } from "zod";

export async function revokeSessionAction(form:FormData) {
  await runAction("/admin/security",async()=>{
    const actor=await requireStaff();
    const id=form.get("id");
    await revokeSession(actor,id?z.string().uuid().parse(id):null);
    return "Sessions revoked.";
  });
}
export async function resetMfaAction(form:FormData) {
  await runAction("/admin/security",async()=>{
    const actor=await requireStaff();
    await resetMfa(actor,z.string().uuid().parse(form.get("userId")),String(form.get("password")??""),String(form.get("reason")??""));
    return "MFA reset. The user must enroll again.";
  });
}
