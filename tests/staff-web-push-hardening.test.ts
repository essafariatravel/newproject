import { describe, expect, it } from "vitest";
import { isTransientPushFailure } from "../src/lib/push-delivery-policy";
import { isPushEligible } from "../src/lib/push-policy";

describe("staff Web Push release hardening", () => {
  it("retries temporary failures but not unauthorized or expired subscriptions", () => {
    for (const status of [null, 429, 500, 502, 503, 504, 599]) {
      expect(isTransientPushFailure(status)).toBe(true);
    }
    for (const status of [200, 201, 204, 400, 401, 403, 404, 410, 422]) {
      expect(isTransientPushFailure(status)).toBe(false);
    }
  });
  it("only allows internal active roles with no agency membership", () => {
    for (const role of ["SUPER_ADMIN", "ADMIN", "VISA_AGENT", "ACCOUNTING"]) {
      expect(isPushEligible({role, agencyId:null, mustChangePassword:false} as Parameters<typeof isPushEligible>[0])).toBe(true);
      expect(isPushEligible({role, agencyId:"agency-id", mustChangePassword:false} as Parameters<typeof isPushEligible>[0])).toBe(false);
    }
    for (const role of ["AGENCY_ADMIN", "AGENCY_USER", "READONLY"]) {
      expect(isPushEligible({role, agencyId:null, mustChangePassword:false} as Parameters<typeof isPushEligible>[0])).toBe(false);
    }
  });
});
