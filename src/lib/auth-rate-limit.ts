import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { qualifiedTable } from "@/lib/database-schema";
import { hashToken } from "@/lib/crypto";

/** Shared database counter makes parallel requests and multiple instances consistent. */
export async function consumeAuthRateLimit(scope: string, subject: string, limit: number, windowMs: number): Promise<boolean> {
  const key = hashToken(`${scope}:${subject.slice(0, 300)}`);
  const table = sql.raw(qualifiedTable("auth_rate_limits"));
  const result = await db.execute(sql`
    with stale as (
      select key from ${table}
       where window_start < now() - interval '2 days'
       order by window_start
       limit 100
    ),
    pruned as (
      delete from ${table} where key in (select key from stale)
    )
    insert into ${table} (key,attempts,window_start) values (${key},1,now())
    on conflict (key) do update set
      attempts=case when ${table}.window_start < now()-${windowMs}*interval '1 millisecond' then 1 else ${table}.attempts+1 end,
      window_start=case when ${table}.window_start < now()-${windowMs}*interval '1 millisecond' then now() else ${table}.window_start end
    returning attempts`);
  return Number(result.rows[0]?.attempts ?? limit + 1) <= limit;
}
