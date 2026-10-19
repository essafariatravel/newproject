"use server";

/**
 * Admin — Agency Registration decision actions.
 * Every action requires staff authentication AND the registrations.manage
 * permission (all ESSAFARIA staff roles). Approve / reject are decision-level
 * operations; start-review / info-request / notes share the same guard.
 */
import { headers } from "next/headers";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AppError, type AuthUser } from "@/lib/types";
import { requireStaff } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { runAction } from "@/lib/action-helpers";
import { createRegistrationFollowup } from "@/lib/registration-followup";
import { registrationCopy, registrationReviewCopy, resolveLocale } from "@/lib/i18n";
import { REGISTRATION_DOCUMENT_CATEGORIES } from "@/lib/registration-constants";
import { getUiLocale } from "@/lib/ui-i18n";
import {
  addInternalNote,
  approveRegistration,
  rejectRegistration,
  requestMoreInformation,
  startRegistrationReview,
} from "@/lib/registrations";

const idSchema = z.string().uuid("Invalid identifier.");

/** Decision-level guard (approve / reject / start review / request info / notes). */
async function requireDecisionMaker(): Promise<AuthUser> {
  const staff = await requireStaff();
  requirePermission(staff, "registrations.manage");
  return staff;
}

export interface RegistrationLinkState { link?: string; error?: string }
export async function issueRegistrationDocumentLinkAction(_previous: RegistrationLinkState, form: FormData): Promise<RegistrationLinkState> {
  const locale = resolveLocale(form.get("locale"));
  const copy = registrationReviewCopy(locale);
  try {
    const actor = await requireDecisionMaker();
    const registrationId = idSchema.parse(form.get("id"));
    const slots = REGISTRATION_DOCUMENT_CATEGORIES.filter((category) => form.get(`request_${category}`) === "true").map((category) => ({ category, label: String(form.get(`label_${category}`) ?? registrationCopy(locale).docCategories[category]!.label) }));
    const result = await createRegistrationFollowup({ actor, registrationId, note:String(form.get("note") ?? ""), slots });
    refresh(registrationId);
    return {link:`/agency/verification/${result.token}`};
  } catch (error) {
    return {error: error instanceof AppError && error.code === "INVALID_STATE" ? copy.start : copy.error};
  }
}

async function ipOf(): Promise<string | null> {
  try {
    const hdrs = await headers();
    return hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  } catch {
    return null;
  }
}

function refresh(id: string): void {
  revalidatePath(`/admin/registrations/${id}`);
  revalidatePath("/admin/registrations");
  revalidatePath("/admin");
}

async function reviewAction(id:string, fn:(copy:ReturnType<typeof registrationReviewCopy>)=>Promise<string>):Promise<never> {
  const copy=registrationReviewCopy(await getUiLocale());
  return runAction(`/admin/registrations/${id}`,async()=>{
    try {return await fn(copy);}
    catch(error) {if(error instanceof AppError) throw new AppError(error.code,copy.actionError);throw error;}
  });
}

export async function startRegistrationReviewAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("id"));
  await reviewAction(id, async (copy) => {
    const staff = await requireDecisionMaker();
    await startRegistrationReview(id, staff, await ipOf());
    refresh(id);
    return copy.reviewSaved;
  });
}

export async function requestRegistrationInfoAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("id"));
  await reviewAction(id, async (copy) => {
    const staff = await requireDecisionMaker();
    const note = String(formData.get("note") ?? "");
    await requestMoreInformation(id, staff, note, await ipOf());
    refresh(id);
    return copy.infoSaved;
  });
}

export async function approveRegistrationAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("id"));
  await reviewAction(id, async (copy) => {
    const staff = await requireDecisionMaker();
    const result = await approveRegistration({ registrationId: id, actor: staff, ipAddress: await ipOf() });
    refresh(id);
    revalidatePath("/admin/agencies");
    if (result.alreadyApproved) {
      return copy.alreadyApproved;
    }
    return copy.approvalSaved;
  });
}

export async function rejectRegistrationAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("id"));
  await reviewAction(id, async (copy) => {
    const staff = await requireDecisionMaker();
    const reason = String(formData.get("reason") ?? "");
    await rejectRegistration(id, staff, reason, await ipOf());
    refresh(id);
    return copy.rejectSaved;
  });
}

export async function addRegistrationNoteAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("id"));
  await reviewAction(id, async (copy) => {
    const staff = await requireDecisionMaker();
    const note = String(formData.get("note") ?? "");
    await addInternalNote(id, staff, note, await ipOf());
    refresh(id);
    return copy.noteSaved;
  });
}
