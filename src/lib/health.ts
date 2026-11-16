import { databaseSchema } from "@/lib/database-schema";
import { databaseUrl } from "@/lib/database-config";

export type PublicHealthStatus = "healthy" | "unavailable";

/**
 * Cheap readiness contract for anonymous platform probes.
 *
 * Do not open a database connection here: the RC's public health route is
 * deliberately connection-free. Authenticated deep health performs the live
 * dependency/schema checks separately.
 */
export function checkReadiness(): PublicHealthStatus {
  if (!process.env.DATABASE_URL) return "unavailable";
  try {
    databaseUrl();
    databaseSchema();
    return "healthy";
  } catch {
    return "unavailable";
  }
}

export function publicHealthBody(status: PublicHealthStatus) {
  return {
    status,
    service: "essafaria-visa-os",
  } as const;
}
