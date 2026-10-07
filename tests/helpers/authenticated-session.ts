import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { sessions } from "@/db/schema";
import { createSession as mintSession } from "@/lib/auth";
import { hashToken } from "@/lib/crypto";

/** Fixture assurance only. MFA tests use the real enrollment/challenge flow. */
export async function createSession(...args: Parameters<typeof mintSession>) {
  const result = await mintSession(...args);
  await db.update(sessions).set({mfaVerifiedAt:new Date()}).where(eq(sessions.tokenHash,hashToken(result.token)));
  return result;
}
