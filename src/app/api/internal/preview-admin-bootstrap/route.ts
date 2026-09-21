/**
 * ONE-SHOT Preview SUPER_ADMIN bootstrap (opt-in, token-gated, Preview-only).
 *
 * Deliberately unreachable unless EVERY gate passes; all guard failures answer
 * 404 so the surface is indistinguishable from "route missing":
 *
 *  1. Production runtime refused outright (VERCEL_ENV === "production").
 *  2. Production schema refused outright (DATABASE_SCHEMA === "visa_os").
 *  3. Remote databases: require DATABASE_SCHEMA === "visa_os_preview" AND
 *     VERCEL_ENV === "preview". Local throwaway dev databases are allowed so
 *     the flow can be rehearsed safely offline.
 *  4. PREVIEW_ADMIN_BOOTSTRAP env var must be configured **Preview scope only**
 *     (Vercel → Env Vars → Preview). Without it the feature is inert.
 *  5. Header `x-admin-bootstrap-token` must match that value (timing-safe).
 *
 * The endpoint provisions or rotates exactly ONE SUPER_ADMIN using the
 * platform's existing scrypt hashing and users model. The plaintext password
 * arrives only in the request body over TLS, is never logged, never stored
 * beyond its scrypt hash, and never appears in source/git.
 */
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { hashPassword } from "@/lib/crypto";
import { databaseSchema } from "@/lib/database-schema";
import { db } from "@/lib/db";
import { users } from "@/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GENESIS_SCHEMA = "visa_os_preview";
const PRODUCTION_SCHEMA = "visa_os";
const MIN_PASSWORD_LEN = 12;
const MAX_BODY_BYTES = 4096;

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(160),
  password: z.string().min(MIN_PASSWORD_LEN).max(128),
  name: z.string().trim().min(2).max(80).optional(),
});

function notFound(): Response {
  return Response.json({ error: "Not found" }, { status: 404 });
}

function isLocalDatabase(): boolean {
  const url = process.env.DATABASE_URL ?? "";
  return url === "" || /localhost|127\.0\.0\.1/.test(url);
}

function guard(): boolean {
  const schema = databaseSchema();
  if (process.env.VERCEL_ENV === "production") return false;
  if (schema === PRODUCTION_SCHEMA) return false;
  if (!isLocalDatabase()) {
    if (schema !== GENESIS_SCHEMA) return false;
    if (process.env.VERCEL_ENV !== "preview") return false;
  }
  const token = process.env.PREVIEW_ADMIN_BOOTSTRAP;
  return typeof token === "string" && token.length >= 16;
}

function tokenMatches(provided: string): boolean {
  const expected = process.env.PREVIEW_ADMIN_BOOTSTRAP ?? "";
  const a = crypto.createHash("sha256").update(provided).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return expected.length > 0 && crypto.timingSafeEqual(a, b);
}

export async function POST(request: Request): Promise<Response> {
  if (!guard()) return notFound();

  const headerToken = request.headers.get("x-admin-bootstrap-token") ?? "";
  if (!tokenMatches(headerToken)) return notFound();

  let raw: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return Response.json({ error: "invalid_request" }, { status: 400 });
    raw = JSON.parse(text);
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "invalid_request", details: parsed.error.issues.length }, { status: 400 });
  }
  const { email, password } = parsed.data;
  const name = parsed.data.name ?? "Preview Administrator";

  const passwordHash = await hashPassword(password);
  const existing = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = lower(${email})`)
    .limit(1);

  let userId: string;
  let mode: "created" | "rotated";
  if (existing[0]) {
    await db
      .update(users)
      .set({ passwordHash, role: "SUPER_ADMIN", agencyId: null, status: "ACTIVE", name })
      .where(sql`${users.id} = ${existing[0].id}`);
    userId = existing[0].id;
    mode = "rotated";
  } else {
    const inserted = await db
      .insert(users)
      .values({ email, passwordHash, name, role: "SUPER_ADMIN", agencyId: null, status: "ACTIVE" })
      .returning();
    userId = inserted[0]!.id;
    mode = "created";
  }

  await recordAudit({
    actor: null,
    action: "PREVIEW_ADMIN_BOOTSTRAP",
    entity: "user",
    entityId: userId,
    metadata: { email, mode, schema: databaseSchema() },
    ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });

  return Response.json({ ok: true, email, mode });
}

export function GET(): Response {
  return notFound();
}
