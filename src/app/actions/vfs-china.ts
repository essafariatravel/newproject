"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { runAction } from "@/lib/action-helpers";
import { saveVfsChinaReference } from "@/lib/vfs-china-bindings";

/**
 * Staff-only action. Agency users cannot assign VFS references.
 * This does not upload certificates or decide/close dossiers.
 */
export async function saveVfsChinaReferenceAction(formData: FormData): Promise<void> {
  const applicationId = z.string().uuid().parse(formData.get("applicationId"));
  const back = `/admin/applications/${applicationId}`;
  await runAction(back, async () => {
    const actor = await requireStaff();
    const reference = z.string().trim().min(12).max(32).parse(formData.get("vfsReference"));
    const result = await saveVfsChinaReference(applicationId, reference, actor);
    revalidatePath(back);
    return result === "CREATED" ? "VFS China reference registered." : "VFS China reference already registered.";
  });
}
