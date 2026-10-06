import { describe, expect, it } from "vitest";
import { transactionalEmailReadiness } from "@/lib/transactional-email";

describe("transactional email readiness", () => {
  it("fails closed when no provider is configured", () => {
    expect(transactionalEmailReadiness({ NODE_ENV: "test" })).toEqual({
      ready: false,
      provider: "disabled",
      missing: ["TRANSACTIONAL_EMAIL_PROVIDER=brevo"],
    });
  });

  it("requires the Brevo secret, verified sender and secure portal origin", () => {
    const result = transactionalEmailReadiness({
      NODE_ENV: "test",
      TRANSACTIONAL_EMAIL_PROVIDER: "brevo",
      BREVO_API_KEY: "test-only",
      TRANSACTIONAL_EMAIL_FROM: "noreply@example.test",
      TRANSACTIONAL_EMAIL_APP_ORIGIN: "https://visa.example.test",
    });
    expect(result).toEqual({ ready: true, provider: "brevo", missing: [] });
  });
});
