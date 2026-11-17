import { describe, expect, it } from "vitest";
import { isStaffPushPreview } from "../src/lib/push-preview";
const preview = {
  VERCEL: "1", VERCEL_ENV: "preview", DATABASE_SCHEMA: "visa_os_preview",
  VERCEL_GIT_COMMIT_REF: "feature/staff-web-push-from-production-20261116",
};
describe("push event simulation must never run in Production", () => {
  it("accepts only exact isolated Preview scope", () => {
    expect(isStaffPushPreview(preview)).toBe(true);
    expect(isStaffPushPreview({ ...preview, VERCEL_ENV: "production" })).toBe(false);
    expect(isStaffPushPreview({ ...preview, DATABASE_SCHEMA: "visa_os" })).toBe(false);
    expect(isStaffPushPreview({ ...preview, VERCEL_GIT_COMMIT_REF: "main" })).toBe(false);
    expect(isStaffPushPreview({ ...preview, VERCEL: "0" })).toBe(false);
    expect(isStaffPushPreview({})).toBe(false);
  });
});
