import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { qualifiedTable } from "@/lib/database-schema";

/** Visible authenticated tabs send a heartbeat; multiple sessions count once. */
export async function touchPresence(userId: string, tokenHash: string) {
  await db.execute(sql`insert into ${sql.raw(qualifiedTable("session_presence"))} (session_id, last_seen_at)
    select id, now() from ${sql.raw(qualifiedTable("sessions"))} where user_id=${userId} and token_hash=${tokenHash} and expires_at>now()
    on conflict (session_id) do update set last_seen_at=excluded.last_seen_at`);
}

export async function onlineUserCount(): Promise<number> {
  const result = await db.execute(sql`select count(distinct s.user_id)::int as total
    from ${sql.raw(qualifiedTable("session_presence"))} p
    join ${sql.raw(qualifiedTable("sessions"))} s on s.id=p.session_id
    join ${sql.raw(qualifiedTable("users"))} u on u.id=s.user_id
    left join ${sql.raw(qualifiedTable("agencies"))} a on a.id=u.agency_id
    where p.last_seen_at>now()-interval '2 minutes' and s.expires_at>now()
    and u.status='ACTIVE' and (a.id is null or a.status='ACTIVE')`);
  return Number(result.rows[0]?.total ?? 0);
}
