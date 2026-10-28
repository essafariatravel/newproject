import { AppError } from "@/lib/types";

/** Preserve the configured provider. Never substitute a different provider. */
export function configuredStorageProvider(env: Record<string,string|undefined> = process.env): "db" | "supabase" {
  const value = env.STORAGE_PROVIDER === undefined ? "db" : env.STORAGE_PROVIDER.trim();
  if (value === "db" || value === "supabase") return value;
  throw new AppError("STORAGE_MISCONFIGURED", "The storage provider is not configured correctly.");
}
