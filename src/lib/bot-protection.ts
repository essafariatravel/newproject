import { isIP } from "node:net";
import { consumeAuthRateLimit } from "@/lib/auth-rate-limit";
import { hashToken } from "@/lib/crypto";
import { AppError } from "@/lib/types";
import { isLocalBotEnvironment, readTurnstileConfig, type TurnstileAction } from "@/lib/turnstile-config";

export const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const MAX_AGE_MS = 300_000;
const IP_LIMITS: Record<TurnstileAction, [number, number]> = {
  agency_login: [60, 15 * 60_000], agency_registration: [20, 60 * 60_000],
  account_recovery: [20, 60 * 60_000], access_reset: [20, 15 * 60_000],
};
const invalid = () => new AppError("BOT_INVALID", "Security verification failed. Please try again.");
const unavailable = () => new AppError("BOT_UNAVAILABLE", "Security verification is temporarily unavailable. Please try again.");

/** On Vercel use only platform-supplied address headers, never CF or form fields. */
export function publicClientIp(requestHeaders: Headers, env: Record<string, string | undefined> = process.env): string | null {
  const raw = env.VERCEL === "1"
    ? requestHeaders.get("x-vercel-forwarded-for") ?? requestHeaders.get("x-forwarded-for")
    : isLocalBotEnvironment(env) ? requestHeaders.get("x-forwarded-for") ?? "127.0.0.1" : null;
  const ip = raw?.split(",")[0]?.trim() ?? "";
  return isIP(ip) ? ip : null;
}

export function assertTurnstileResponse(payload: unknown, action: TurnstileAction, hostnames: string[], now = Date.now()): void {
  if (!payload || typeof payload !== "object") throw invalid();
  const result = payload as Record<string, unknown>;
  const timestamp = typeof result.challenge_ts === "string" ? Date.parse(result.challenge_ts) : NaN;
  if (result.success !== true || result.action !== action || typeof result.hostname !== "string" ||
      !hostnames.includes(result.hostname.toLowerCase()) || !Number.isFinite(timestamp) ||
      now - timestamp >= MAX_AGE_MS || timestamp - now > 30_000) throw invalid();
}

/** The gate runs inside each public Server Action, including direct POST calls. */
export async function assertPublicBotProtection(form: FormData, action: TurnstileAction, requestHeaders: Headers): Promise<void> {
  const config = readTurnstileConfig();
  if (!config.enabled) return;
  const local = isLocalBotEnvironment(process.env);
  let origin: URL;
  try { origin = new URL(requestHeaders.get("origin") ?? ""); } catch { throw invalid(); }
  if (!config.hostnames.includes(origin.hostname) || origin.host !== requestHeaders.get("host") ||
      (origin.protocol !== "https:" && !(local && origin.protocol === "http:")) || origin.username || origin.password) throw invalid();
  const values = form.getAll("cf-turnstile-response");
  const token = values[0];
  if (values.length !== 1 || typeof token !== "string" || token.length === 0 || token.length > 2048) throw invalid();
  const ip = publicClientIp(requestHeaders);
  if (!ip) throw unavailable();
  const [limit, windowMs] = IP_LIMITS[action];
  try {
    if (!await consumeAuthRateLimit(`bot-${action}-ip`, ip, limit, windowMs)) {
      throw new AppError("BOT_RATE_LIMITED", "Too many attempts. Please wait before trying again.");
    }
    const response = await fetch(SITEVERIFY_URL, {
      method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5_000),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: config.secret, response: token, remoteip: ip }),
    });
    if (!response.ok) throw unavailable();
    let result: unknown;
    try { result = await response.json(); } catch { throw unavailable(); }
    assertTurnstileResponse(result, action, [origin.hostname]);
    // Siteverify is single-use. This atomic, full-token hash claim also protects
    // parallel application instances and local simulations from replay.
    if (!await consumeAuthRateLimit("turnstile-replay", hashToken(token), 1, 10 * 60_000)) throw invalid();
    if (action === "access_reset") {
      const resetToken = form.get("token");
      if (typeof resetToken !== "string" || !resetToken || resetToken.length > 90) throw invalid();
      if (!await consumeAuthRateLimit("reset-identity", hashToken(resetToken), 5, 15 * 60_000)) {
        throw new AppError("BOT_RATE_LIMITED", "Too many attempts. Please wait before trying again.");
      }
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw unavailable();
  }
}
