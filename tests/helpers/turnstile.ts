import { vi } from "vitest";
import { request } from "./request";

let nonce = 0;

/** Mock only Cloudflare's external service; keep all server gates and SQL real. */
export function managedLoginChallenge(hostname = "auth-policy.example.test") {
  vi.stubEnv("TURNSTILE_MODE", "managed");
  vi.stubEnv("TURNSTILE_SITE_KEY", "synthetic_managed_public_key");
  vi.stubEnv("TURNSTILE_SECRET", "synthetic_managed_private_key");
  vi.stubEnv("TURNSTILE_HOSTNAMES", hostname);
  request.headers = new Headers({
    origin: `https://${hostname}`, host: hostname,
    "x-forwarded-for": "192.0.2.80", "x-vercel-forwarded-for": "192.0.2.80",
  });
  vi.stubGlobal("fetch", vi.fn(async (input: unknown) => {
    if (String(input) !== "https://challenges.cloudflare.com/turnstile/v0/siteverify") {
      throw new Error("Unexpected network access in the local authentication fixture");
    }
    return Response.json({
      success: true, hostname, action: "password_login", challenge_ts: new Date().toISOString(),
    });
  }));
}

export function managedLoginForm(identifier: string, password: string) {
  const form = new FormData();
  form.set("identifier", identifier);
  form.set("password", password);
  form.set("cf-turnstile-response", `synthetic-managed-${++nonce}`);
  return form;
}
