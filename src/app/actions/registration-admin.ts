"use server";

/**
 * Admin — Agency Registration decision actions.
 * Every action requires staff authentication AND the registrations.manage
 * permission (SUPER_ADMIN / ADMIN). Approve / reject are decision-level
 * operations; start-review / info-request / notes share the same guard.
 */
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z, ZodError } from "zod";
import { AppError, type AuthUser } from "@/lib/types";
import { requireStaff } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { runAction } from "@/lib/action-helpers";
import {
  addInternalNote,
  approveRegistration,
  createActivationTokenForRegistration,
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

export async function startRegistrationReviewAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("id"));
  await runAction(`/admin/registrations/${id}`, async () => {
    const staff = await requireDecisionMaker();
    await startRegistrationReview(id, staff, await ipOf());
    refresh(id);
    return "Registration is now under review.";
  });
}

export async function requestRegistrationInfoAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("id"));
  await runAction(`/admin/registrations/${id}`, async () => {
    const staff = await requireDecisionMaker();
    const note = String(formData.get("note") ?? "");
    await requestMoreInformation(id, staff, note, await ipOf());
    refresh(id);
    return "More information requested from the applicant.";
  });
}

export async function approveRegistrationAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("id"));
  await runAction(`/admin/registrations/${id}`, async () => {
    const staff = await requireDecisionMaker();
    const result = await approveRegistration({ registrationId: id, actor: staff, ipAddress: await ipOf() });
    refresh(id);
    revalidatePath("/admin/agencies");
    if (result.alreadyApproved) {
      return "This registration was already approved — the existing agency and administrator are unchanged.";
    }
    return `Registration approved. "${result.legalName}" now has an agency and an Agency Admin (${result.contactEmail}). Generate the activation link below and share it with the partner.`;
  });
}

export async function rejectRegistrationAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("id"));
  await runAction(`/admin/registrations/${id}`, async () => {
    const staff = await requireDecisionMaker();
    const reason = String(formData.get("reason") ?? "");
    await rejectRegistration(id, staff, reason, await ipOf());
    refresh(id);
    return "Registration rejected. No agency, portal access or wallet credit was created; the record remains for audit.";
  });
}

export async function addRegistrationNoteAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("id"));
  await runAction(`/admin/registrations/${id}`, async () => {
    const staff = await requireDecisionMaker();
    const note = String(formData.get("note") ?? "");
    await addInternalNote(id, staff, note, await ipOf());
    refresh(id);
    return "Internal note added.";
  });
}

/** Best-effort absolute base URL for the activation link (host-aware). */
async function publicBaseUrl(): Promise<string | null> {
  try {
    const hdrs = await headers();
    const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host");
    if (!host) return null;
    const proto = hdrs.get("x-forwarded-proto") ?? "https";
    return `${proto}://${host}`;
  } catch {
    return null;
  }
}

/**
 * Generate a single-use activation link for the Agency Admin of an approved
 * registration. Rendering a new link revokes every previous unused one.
 * The link is returned ONCE in the flash area of the detail page to an
 * authorized administrator — it is never stored in plaintext.
 */
export async function generateActivationLinkAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("id"));
  let link: string;
  try {
    const staff = await requireDecisionMaker();
    const issued = await createActivationTokenForRegistration(id, staff);
    const base = await publicBaseUrl();
    link = base ? `${base}/activate/${issued.token}` : `/activate/${issued.token}`;
    refresh(id);
  } catch (err) {
    const msg =
      err instanceof AppError
        ? err.message
        : err instanceof ZodError
          ? (err.issues[0]?.message ?? "Invalid request.")
          : (console.error("[registrations] activation link failed", err), "Something went wrong. Please try again.");
    redirect(`/admin/registrations/${id}?error=${encodeURIComponent(msg)}`);
  }
  const ok = "Single-use activation link generated (expires in 72 hours; previous links revoked). Copy it now and share it securely with the partner.";
  redirect(`/admin/registrations/${id}?ok=${encodeURIComponent(ok)}&activation=${encodeURIComponent(link)}`);
}
