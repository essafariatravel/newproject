import "./lib/load-env";
import { Pool, type PoolClient } from "pg";
import { databasePoolConfig } from "../src/lib/database-config";
import { hashPassword } from "../src/lib/crypto";
import { assertSafePerfTarget, perfTable, safeTargetSummary } from "./perf-safety";

const AGENCY_EMAIL = "perf.agency@load.example";
const AGENCY_NAME = "PERF_LOAD_AGENCY";

const USERS = [
  { email: "perf.superadmin@load.example", username: null, role: "SUPER_ADMIN", name: "PERF Super Admin", agency: false },
  { email: "perf.admin@load.example", username: null, role: "ADMIN", name: "PERF Admin", agency: false },
  { email: "perf.agent@load.example", username: null, role: "VISA_AGENT", name: "PERF Visa Agent", agency: false },
  { email: "perf.accounting@load.example", username: null, role: "ACCOUNTING", name: "PERF Accounting", agency: false },
  { email: "perf.agencyadmin@load.example", username: "perf_agency_admin", role: "AGENCY_ADMIN", name: "PERF Agency Admin", agency: true },
  { email: "perf.agencyuser@load.example", username: "perf_agency_user", role: "AGENCY_USER", name: "PERF Agency User", agency: true },
] as const;

async function ensureAgency(client: PoolClient): Promise<string> {
  const existing = await client.query<{ id: string; status: string; currency: string }>(
    `select id, status, currency from ${perfTable("agencies")} where lower(email)=lower($1) limit 1`,
    [AGENCY_EMAIL],
  );
  if (existing.rows[0]) {
    if (existing.rows[0].status !== "ACTIVE" || existing.rows[0].currency !== "DZD") {
      throw new Error("Existing PERF agency is not ACTIVE/DZD; refusing to modify it automatically.");
    }
    return existing.rows[0].id;
  }

  const created = await client.query<{ id: string }>(
    `insert into ${perfTable("agencies")}
       (legal_name, trading_name, email, status, balance, currency, notes)
     values ($1,$1,$2,'ACTIVE',0,'DZD','Synthetic performance-test tenant. Never use for real operations.')
     returning id`,
    [AGENCY_NAME, AGENCY_EMAIL],
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
        }>(
          `select id, role, agency_id, status, activation_pending, must_change_password
             from ${perfTable("users")} where lower(email)=lower($1) limit 1`,
          [spec.email],
        );

        if (existing.rows[0]) {
          const row = existing.rows[0];
          const expectedAgency = spec.agency ? agencyId : null;
          if (
            row.role !== spec.role ||
            row.agency_id !== expectedAgency ||
            row.status !== "ACTIVE" ||
            row.activation_pending ||
            row.must_change_password
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

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Synthetic identity setup failed.");
  process.exit(1);
});
