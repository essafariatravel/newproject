import { AppError } from "@/lib/types";

type Environment = Record<string, string | undefined>;
export type TurnstileAction = "agency_login" | "agency_registration" | "account_recovery" | "access_reset";
export interface TurnstilePublicConfig { enabled: boolean; siteKey: string }
export type TurnstileConfig = { enabled: false } | { enabled: true; siteKey: string; secret: string; hostnames: string[] };

export function isLocalBotEnvironment(env: Environment): boolean {
  if (env.VERCEL || env.VERCEL_ENV || env.VERCEL_TARGET_ENV) return false;
  try {
    const url = new URL(env.DATABASE_URL ?? "");
    // pg accepts query-string routing overrides. A local bypass accepts only
    // a plain loopback PostgreSQL URI, never an alternate host/options query.
    return ["postgres:", "postgresql:"].includes(url.protocol) &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
      Boolean(url.pathname.slice(1)) && !url.search && !url.hash;
  } catch { return false; }
}

export function readTurnstileConfig(env: Environment = process.env): TurnstileConfig {
  const local = isLocalBotEnvironment(env);
  if (env.TURNSTILE_MODE === "off" && local) return { enabled: false };
  const siteKey = env.TURNSTILE_SITE_KEY?.trim() ?? "";
  const secret = env.TURNSTILE_SECRET?.trim() ?? "";
  const hostnames = [...new Set((env.TURNSTILE_HOSTNAMES ?? "").split(",").map(h => h.trim().toLowerCase()).filter(Boolean))];
  const testKey = /^[123]x0{10,}/;
  if ((env.TURNSTILE_MODE && env.TURNSTILE_MODE !== "managed") ||
      !/^[A-Za-z0-9_-]{10,100}$/.test(siteKey) || !secret || /\s/.test(secret) || hostnames.length === 0 ||
      hostnames.some(h => !/^(?:[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?|\[::1\])$/.test(h)) ||
      (!local && (testKey.test(siteKey) || testKey.test(secret) || hostnames.some(h => ["localhost", "127.0.0.1", "[::1]"].includes(h))))) {
    throw new AppError("BOT_UNAVAILABLE", "Security verification is temporarily unavailable. Please try again.");
  }
  return { enabled: true, siteKey, secret, hostnames };
}

/** Only this small projection may cross a Server Component boundary. */
export function publicTurnstileConfig(): TurnstilePublicConfig {
  try {
    const config = readTurnstileConfig();
    return { enabled: config.enabled, siteKey: config.enabled ? config.siteKey : "" };
  } catch { return { enabled: true, siteKey: "" }; }
}
