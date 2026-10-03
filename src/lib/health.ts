import { pool } from "@/lib/db";
import { logErrorOnce } from "@/lib/observability";

export type PublicHealthStatus = "healthy" | "unavailable";

export async function checkReadiness(): Promise<PublicHealthStatus> {
  try {
    await pool.query("select 1");
    return "healthy";
  } catch (error) {
    logErrorOnce("health.readiness.failed", error, {
      severity: "error",
      classification: "BUSINESS_FAILURE",
      result: "technical_failed",
      action: "readiness",
    });
    return "unavailable";
  }
}

export function publicHealthBody(status: PublicHealthStatus) {
  return {
    status,
    service: "essafaria-visa-os",
  } as const;
}
