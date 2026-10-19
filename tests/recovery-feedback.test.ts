import { describe, expect, it } from "vitest";
import { localizeError } from "@/lib/i18n-content";
import { resetAccessAction } from "@/app/actions/recovery";
import { request } from "./helpers/request";
describe("localized recovery failures", () => {
  it("localizes reset mismatch through the real action", async () => {
    request.cookie="ar";
    try {
      const form = new FormData(); form.set("password","Password-123"); form.set("confirm","Mismatch-123");
      const result = await resetAccessAction({},form);
      expect(result.error).toBe("تأكيد كلمة المرور لا يطابق كلمة المرور الجديدة.");
    } finally {request.cookie="";}
  });
  it("uses a localized safe fallback for a dynamic validation error", () => {
    expect(localizeError("fr","String must contain at least 15 character(s)")).toBe("Vérifiez les champs du formulaire et réessayez.");
  });
});
