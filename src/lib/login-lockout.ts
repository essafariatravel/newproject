import { createHmac } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { qualifiedTable } from "@/lib/database-schema";
import { AppError } from "@/lib/types";

type Executor = Pick<typeof db, "execute">;
const counters = () => sql.raw(qualifiedTable("auth_rate_limits"));
const window = sql`interval '10 minutes'`;

/** Only a password-verified agency session path may surface this result. */
export class PasswordLoginLockedError extends AppError {
  constructor(readonly retryAfterSeconds: number) {
    super("INVALID_CREDENTIALS", "Invalid email or password.");
  }
}

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

/** Called under the identity lock, after credential/version/status checks. */
export async function assertPasswordLoginAllowed(executor: Executor, key: string): Promise<void> {
  const result = await executor.execute<{ retry_after_seconds: number }>(sql`
    select least(600, greatest(0, ceil(extract(epoch from (
      window_start + interval '10 minutes' - clock_timestamp()
    )))))::integer as retry_after_seconds
    from ${counters()} where key = ${key} and attempts = 3
      and window_start > clock_timestamp() - ${window}
  `);
  const remaining = Number(result.rows[0]?.retry_after_seconds ?? 0);
  if (remaining > 0) throw new PasswordLoginLockedError(remaining);
}

export async function clearPasswordFailures(tx: Executor, key: string): Promise<void> {
  await tx.execute(sql`delete from ${counters()} where key in (${key}, ${key + ":previous"})`);
}

/**
 * Unknown, unusable and Staff credentials use a neutral shadow bucket: same
 * hashing/SQL work, never an agency lock. Every failed attempt uses the same
 * transaction and SQL statements, including already locked or empty buckets.
 */
export async function recordPasswordFailure(key: string): Promise<void> {
  await db.transaction(async (tx) => {
    await lockPasswordLogin(tx, key);
    const previous = key + ":previous";
    const table = counters();
    await tx.execute(sql`
      with event as (
        select statement_timestamp() as attempted_at
      ), state as (
        select current.attempts, current.window_start as failed_at,
          prior.window_start as previous_at, event.attempted_at
        from event
        left join ${table} current on current.key = ${key}
          and current.window_start > event.attempted_at - ${window}
        left join ${table} prior on prior.key = ${previous}
          and prior.window_start > event.attempted_at - ${window}
      ), next as (
        select
          case when attempts = 3 then 3 when attempts is null then 1
            when attempts = 2 and previous_at is not null then 3 else 2 end as attempts,
          case when attempts = 3 then failed_at else attempted_at end as failed_at,
          case when attempts in (1, 2) and not (attempts = 2 and previous_at is not null)
            then failed_at else null end as previous_at
        from state
      ), removed as (
        delete from ${table} where key = ${previous}
          and (select previous_at is null from next)
      ), kept as (
        insert into ${table} (key, attempts, window_start)
        select ${previous}, 1, previous_at from next where previous_at is not null
        on conflict (key) do update set window_start = excluded.window_start
      )
      insert into ${table} (key, attempts, window_start)
      select ${key}, attempts, failed_at from next
      on conflict (key) do update
        set attempts = excluded.attempts, window_start = excluded.window_start
    `);
  });
}
