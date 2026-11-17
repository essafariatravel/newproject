/** A simulation must never write test events to the live Production database. */
export function isStaffPushPreview(env: Record<string, string | undefined> = process.env): boolean {
  return env.VERCEL === "1" &&
    env.VERCEL_ENV === "preview" &&
    env.VERCEL_GIT_COMMIT_REF === "feature/staff-web-push-from-production-20261116" &&
    env.DATABASE_SCHEMA === "visa_os_preview";
}
