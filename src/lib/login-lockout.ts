import { createHmac } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { qualifiedTable } from "@/lib/database-schema";
import { AppError } from "@/lib/types";

type Executor = Pick<typeof db, "execute">;
const counters = () => sql.raw(qualifiedTable("auth_rate_limits"));
const window = sql`interval '10 minutes'`;

export function normalizedLoginEmail(identifier: string): string {
  const email = identifier.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

export function passwordLoginKey(identifier: string): string {
  const secret = process.env.AUTH_LOGIN_COUNTER_SECRET ?? "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(secret)) {
    throw new AppError("SERVICE_UNAVAILABLE", "Service temporarily unavailable. Please try again.");
  }
  const subject = normalizedLoginEmail(identifier) || `invalid:${identifier.trim().normalize("NFKC").toLowerCase().slice(0, 254)}`;
  return "login-failure-v1:" + createHmac("sha256", Buffer.from(secret, "base64url")).update(subject).digest("hex");
}

/** A transaction lock serializes writes even when the counter row does not exist yet. */
export async function lockPasswordLogin(tx: Executor, key: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
}

export async function assertPasswordLoginAllowed(executor: Executor, key: string): Promise<void> {
  const result = await executor.execute(sql`select 1 from ${counters()}
    where key = ${key} and attempts = 3 and window_start > clock_timestamp() - ${window}`);
  if (result.rows.length) throw new AppError("INVALID_CREDENTIALS", "Invalid email or password.");
}

/** Show remaining time only for one active agency account, never Staff or unknown users. */
export async function agencyPasswordLoginRetryAfterSeconds(identifier: string): Promise<number> {
  const normalized = normalizedLoginEmail(identifier);
  if (!normalized) return 0;
  const key = passwordLoginKey(normalized);
  const userTable = sql.raw(qualifiedTable("users"));
  const result = await db.execute<{ retry_after_seconds: number }>(sql`
    select least(600, greatest(0, ceil(extract(epoch from (
      locks.window_start + interval '10 minutes' - clock_timestamp()
    )))))::integer as retry_after_seconds
    from ${counters()} locks
    where locks.key = ${key}
      and locks.attempts = 3
      and locks.window_start > clock_timestamp() - interval '10 minutes'
      and (
        select count(*) from ${userTable} account
        where lower(btrim(account.email)) = ${normalized}
          and account.status = 'ACTIVE'
          and account.activation_pending = false
          and account.agency_id is not null
          and account.role in ('AGENCY_ADMIN', 'AGENCY_USER')
      ) = 1
    limit 1
  `);
  return Number(result.rows[0]?.retry_after_seconds ?? 0);
}

export async function clearPasswordFailures(tx: Executor, key: string): Promise<void> {
  await tx.execute(sql`delete from ${counters()} where key in (${key}, ${key + ":previous"})`);
}

export async function recordPasswordFailure(key: string): Promise<void> {
  await db.transaction(async (tx) => {
    await lockPasswordLogin(tx, key);
    const previous = key + ":previous";
    const table = counters();
    const result = await tx.execute<{ key: string | null; attempts: number | null; failed_at: string | null; attempted_at: string }>(sql`
      select counter.key, counter.attempts, counter.window_start::text as failed_at, event.attempted_at::text
      from (select statement_timestamp() as attempted_at) event
      left join ${table} counter on counter.key in (${key}, ${previous})
        and counter.window_start > event.attempted_at - ${window}
    `);
    const latest = result.rows.find(row => row.key === key);
    if (latest?.attempts === 3) return; // A blocked request never extends the lock.
    const next = !latest ? 1 : latest.attempts === 2 && result.rows.some(row => row.key === previous) ? 3 : 2;
    if (next === 2 && latest) {
      // Keep the two most recent failure times so the window can slide across the first failure.
      await tx.execute(sql`insert into ${table} (key, attempts, window_start)
        values (${previous}, 1, ${latest.failed_at}::timestamptz)
        on conflict (key) do update set window_start = excluded.window_start`);
    } else {
      await tx.execute(sql`delete from ${table} where key = ${previous}`);
    }
    await tx.execute(sql`insert into ${table} (key, attempts, window_start)
      values (${key}, ${next}, ${result.rows[0]!.attempted_at}::timestamptz)
      on conflict (key) do update set attempts = excluded.attempts, window_start = excluded.window_start`);
  });
}
