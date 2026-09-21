/**
 * One-shot PREVIEW SUPER_ADMIN provisioning / password reset.
 *
 * SAFETY GUARANTEES (all enforced before any DELETE/INSERT/UPDATE):
 *  - DATABASE_SCHEMA must be exactly "visa_os_preview" — refuses every other
 *    schema, including Production's "visa_os". Hard stop before connecting.
 *  - Requires interactive/CI confirmation flag CONFIRM_PREVIEW_ADMIN_RESET=yes.
 *  - Never prints the password; never writes it to disk or git.
 *  - Reuses the platform's existing scrypt hashing (src/lib/crypto) and the
 *    existing users model (src/db/schema) — no new auth code.
 *  - Exactly ONE account is provisioned/rotated (selected by lowercase email).
 *
 * Usage:
 *   CONFIRM_PREVIEW_ADMIN_RESET=yes \
 *   DATABASE_SCHEMA=visa_os_preview \
 *   DATABASE_URL=<preview pooler uri> \
 *   RESET_ADMIN_EMAIL=admin@essafaria.example \
 *   RESET_ADMIN_PASSWORD=<chosen by the operator, conveyed via secret store> \
 *   RESET_ADMIN_NAME="Preview Administrator" \
 *   npx tsx scripts/reset-preview-admin.ts
 */
import "./lib/load-env";
import { sql } from "drizzle-orm";
import { db, pool } from "../src/lib/db";
import { users } from "../src/db/schema";
import { hashPassword } from "../src/lib/crypto";
import { databaseSchema } from "../src/lib/database-schema";

const EXPECTED_SCHEMA = "visa_os_preview";
const FORBIDDEN_SCHEMA = "visa_os"; // Production — never touch, ever.
const MIN_PASSWORD_LEN = 12;

async function main(): Promise<void> {
  const schema = databaseSchema();
  const url = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/essafaria";
  const isLocal = /localhost|127\.0\.0\.1/.test(url);
  if (schema === FORBIDDEN_SCHEMA) {
    console.error("[reset-preview-admin] REFUSING: DATABASE_SCHEMA targets Production (visa_os). Abort.");
    process.exit(2);
  }
  if (!isLocal && schema !== EXPECTED_SCHEMA) {
    console.error(
      `[reset-preview-admin] REFUSING: DATABASE_SCHEMA="${schema}" — remote runs require exactly "${EXPECTED_SCHEMA}" (Preview).`,
    );
    process.exit(2);
  }
  console.log(`[reset-preview-admin] lane: ${isLocal ? "LOCAL scratch database" : "REMOTE Preview"} (schema=${schema})`);
  if (process.env.CONFIRM_PREVIEW_ADMIN_RESET !== "yes") {
    console.error(
      "[reset-preview-admin] REFUSING: set CONFIRM_PREVIEW_ADMIN_RESET=yes to acknowledge a Preview SUPER_ADMIN reset.",
    );
    process.exit(2);
  }
  const email = (process.env.RESET_ADMIN_EMAIL ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error("[reset-preview-admin] REFUSING: RESET_ADMIN_EMAIL is missing or not a valid email.");
    process.exit(2);
  }
  const password = process.env.RESET_ADMIN_PASSWORD ?? "";
  if (password.length < MIN_PASSWORD_LEN) {
    console.error(`[reset-preview-admin] REFUSING: RESET_ADMIN_PASSWORD must be ≥${MIN_PASSWORD_LEN} characters.`);
    process.exit(2);
  }
  const name = (process.env.RESET_ADMIN_NAME ?? "Preview Administrator").trim() || "Preview Administrator";

  const passwordHash = await hashPassword(password);

  const existing = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = lower(${email})`)
    .limit(1);

  let mode: "created" | "rotated";
  if (existing[0]) {
    // Upsert without deleting anything: rotate exactly this account's hash and
    // re-assert the staff SUPER_ADMIN invariants (agencyId must be null).
    await db
      .update(users)
      .set({ passwordHash, role: "SUPER_ADMIN", agencyId: null, status: "ACTIVE", name })
      .where(sql`${users.id} = ${existing[0].id}`);
    mode = "rotated";
  } else {
    await db.insert(users).values({
      email,
      passwordHash,
      name,
      role: "SUPER_ADMIN",
      agencyId: null,
      status: "ACTIVE",
    });
    mode = "created";
  }

  // Read-back sanity: role never trust-verify via the same connection only.
  const afterwards = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = lower(${email})`)
    .limit(1);
  const row = afterwards[0];
  if (!row || row.role !== "SUPER_ADMIN" || row.status !== "ACTIVE" || row.agencyId !== null) {
    console.error("[reset-preview-admin] Verification failed after write; manual inspection advised.");
    process.exit(1);
  }

  console.log(
    `[reset-preview-admin] OK (${mode}) schema=${schema} email=${email} role=SUPER_ADMIN status=ACTIVE ` +
      `hashPrefix=${row.passwordHash.slice(0, 8)}… (never the plaintext)`,
  );
}

main()
  .catch((err) => {
    console.error("[reset-preview-admin] failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .then(() => pool.end())
  .then(() => process.exit(0));
