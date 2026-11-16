import "./lib/perf-local-env";
import { Pool, type PoolClient } from "pg";
import { databasePoolConfig } from "../src/lib/database-config";
import { hashPassword, verifyPassword } from "../src/lib/crypto";
import { assertSafePerfTarget, perfTable, safeTargetSummary } from "./perf-safety";

const AGENCY_EMAIL = "perf.agency@load.example";
const AGENCY_NAME = "PERF_LOAD_AGENCY";
const AGENCY_NOTES = "Synthetic performance-test tenant. Never use for real operations.";

const USERS = [
  { email: "perf.superadmin@load.example", username: null, role: "SUPER_ADMIN", name: "PERF Super Admin", agency: false },
  { email: "perf.admin@load.example", username: null, role: "ADMIN", name: "PERF Admin", agency: false },
  { email: "perf.agent@load.example", username: null, role: "VISA_AGENT", name: "PERF Visa Agent", agency: false },
  { email: "perf.accounting@load.example", username: null, role: "ACCOUNTING", name: "PERF Accounting", agency: false },
  { email: "perf.agencyadmin@load.example", username: "perf_agency_admin", role: "AGENCY_ADMIN", name: "PERF Agency Admin", agency: true },
  { email: "perf.agencyuser@load.example", username: "perf_agency_user", role: "AGENCY_USER", name: "PERF Agency User", agency: true },
] as const;

async function ensureAgency(client: PoolClient): Promise<string> {
  const existing = await client.query<{ id: string; status: string; currency: string; legal_name: string; notes: string | null }>(
    `select id, status, currency, legal_name, notes from ${perfTable("agencies")} where lower(email)=lower($1)`,
    [AGENCY_EMAIL],
  );
  if (existing.rows[0]) {
    if (existing.rows.length !== 1 || existing.rows[0].status !== "ACTIVE" || existing.rows[0].currency !== "DZD" ||
        existing.rows[0].legal_name !== AGENCY_NAME || existing.rows[0].notes !== AGENCY_NOTES) {
      throw new Error("Existing PERF agency does not match the synthetic fixture; refusing to modify it.");
    }
    return existing.rows[0].id;
  }

  const created = await client.query<{ id: string }>(
    `insert into ${perfTable("agencies")}
       (legal_name, trading_name, email, status, balance, currency, notes)
     values ($1,$1,$2,'ACTIVE',0,'DZD',$3)
     returning id`,
    [AGENCY_NAME, AGENCY_EMAIL, AGENCY_NOTES],
  );
  return created.rows[0]!.id;
}

async function main() {
  const target = assertSafePerfTarget();
  const password = process.env.PERF_SYNTHETIC_PASSWORD ?? "";
  if (password.length < 16) {
    throw new Error("PERF_SYNTHETIC_PASSWORD must contain at least 16 characters. It is never printed.");
  }
  const passwordHash = await hashPassword(password);

  const pool = new Pool({ ...databasePoolConfig(process.env), max: 1 });
  try {
    const client = await pool.connect();
    try {
      await client.query("begin");
      // Serialize creation because agency emails are not globally unique.
      await client.query("select pg_advisory_xact_lock(hashtext($1))", ["perf-seed-identities"]);
      const agencyId = await ensureAgency(client);

      const summary: Array<{ email: string; role: string; status: "created" | "existing" }> = [];
      for (const spec of USERS) {
        const existing = await client.query<{
          id: string;
          role: string;
          agency_id: string | null;
          status: string;
          activation_pending: boolean;
          must_change_password: boolean;
          name: string;
          username: string | null;
          password_hash: string;
        }>(
          `select id, role, agency_id, status, activation_pending, must_change_password, name, username, password_hash
             from ${perfTable("users")} where lower(email)=lower($1)`,
          [spec.email],
        );

        if (existing.rows[0]) {
          const row = existing.rows[0];
          const expectedAgency = spec.agency ? agencyId : null;
          if (
            existing.rows.length !== 1 || row.role !== spec.role ||
            row.agency_id !== expectedAgency ||
            row.status !== "ACTIVE" ||
            row.activation_pending ||
            row.must_change_password || row.name !== spec.name || row.username !== spec.username ||
            !(await verifyPassword(password, row.password_hash))
          ) {
            throw new Error(`Existing synthetic identity ${spec.email} does not match the expected safe fixture state.`);
          }
          summary.push({ email: spec.email, role: spec.role, status: "existing" });
          continue;
        }

        await client.query(
          `insert into ${perfTable("users")}
             (email, password_hash, username, activation_pending, credential_version, name, role, agency_id, status, must_change_password)
           values ($1,$2,$3,false,0,$4,$5,$6,'ACTIVE',false)`,
          [spec.email, passwordHash, spec.username, spec.name, spec.role, spec.agency ? agencyId : null],
        );
        summary.push({ email: spec.email, role: spec.role, status: "created" });
      }

      await client.query("commit");
      console.log(JSON.stringify({
        ok: true,
        target: safeTargetSummary(target),
        agency: AGENCY_EMAIL,
        identities: summary,
        note: "Local synthetic password identities only. No sessions or MFA proof are created. Staff MFA enrollment/challenge must use the real local ceremony.",
      }, null, 2));
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch(() => {
  // PostgreSQL details can include a row or private connection information.
  console.error("Synthetic identity setup failed; no fixture changes were committed. Check local prerequisites and fixture consistency.");
  process.exit(1);
});
