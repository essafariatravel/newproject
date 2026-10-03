import "./lib/load-env";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Pool } from "pg";
import { databasePoolConfig } from "../src/lib/database-config";
import { generateSessionToken, hashToken } from "../src/lib/crypto";
import { assertSafePerfTarget, perfTable, safeTargetSummary } from "./perf-safety";

const IDENTITIES = [
  { email: "perf.superadmin@load.example", role: "SUPER_ADMIN" },
  { email: "perf.admin@load.example", role: "ADMIN" },
  { email: "perf.agent@load.example", role: "VISA_AGENT" },
  { email: "perf.accounting@load.example", role: "ACCOUNTING" },
  { email: "perf.agencyadmin@load.example", role: "AGENCY_ADMIN" },
  { email: "perf.agencyuser@load.example", role: "AGENCY_USER" },
] as const;

async function main() {
  const target = assertSafePerfTarget();
  const perRole = Number(process.env.PERF_SESSIONS_PER_ROLE ?? "50");
  if (!Number.isInteger(perRole) || perRole < 1 || perRole > 1000) {
    throw new Error("PERF_SESSIONS_PER_ROLE must be an integer between 1 and 1000.");
  }

  const output = resolve(process.env.PERF_SESSION_FILE ?? "perf/.runtime/sessions.json");
  const pool = new Pool({ ...databasePoolConfig(process.env), max: 1 });
  const roles: Record<string, string[]> = {};

  try {
    const client = await pool.connect();
    try {
      await client.query("begin");
      for (const identity of IDENTITIES) {
        const user = await client.query<{
          id: string;
          role: string;
          agency_id: string | null;
          status: string;
          credential_version: number;
          agency_status: string | null;
        }>(
          `select u.id, u.role, u.agency_id, u.status, u.credential_version,
                  a.status as agency_status
             from ${perfTable("users")} u
             left join ${perfTable("agencies")} a on a.id=u.agency_id
            where lower(u.email)=lower($1) limit 1`,
          [identity.email],
        );
        const row = user.rows[0];
        if (!row || row.role !== identity.role || row.status !== "ACTIVE") {
          throw new Error(`Synthetic identity ${identity.email} is missing or inactive.`);
        }
        if (row.agency_id && row.agency_status !== "ACTIVE") {
          throw new Error(`Synthetic agency for ${identity.email} is inactive.`);
        }

        roles[identity.role] = [];
        for (let i = 0; i < perRole; i++) {
          const raw = generateSessionToken();
          await client.query(
            `insert into ${perfTable("sessions")}
               (user_id, token_hash, expires_at, last_activity_at, credential_version, user_agent)
             values ($1,$2,now()+interval '3 hours',now(),$3,'essafaria-performance-harness')`,
            [row.id, hashToken(raw), row.credential_version],
          );
          roles[identity.role]!.push(raw);
        }
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }

  await mkdir(dirname(output), { recursive: true });
  await writeFile(
    output,
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      cookieName: "evos_session",
      sessionsPerRole: perRole,
      roles,
    }, null, 2),
    { mode: 0o600 },
  );

  console.log(JSON.stringify({
    ok: true,
    target: safeTargetSummary(target),
    sessionFile: output,
    sessionsPerRole: perRole,
    roles: Object.fromEntries(Object.entries(roles).map(([role, tokens]) => [role, tokens.length])),
    note: "Raw session tokens are stored only in the gitignored runtime file and are never printed.",
  }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Synthetic session creation failed.");
  process.exit(1);
});
