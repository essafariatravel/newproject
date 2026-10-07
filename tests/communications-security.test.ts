import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { suiteSetup } from "./helpers/global-state";
import { request } from "./helpers/request";
import { agencyByEmail, userByEmail } from "./helpers/fixtures";
import { db, pool } from "@/lib/db";
import { applications, authRateLimits, communications, visaTypes } from "@/db/schema";
import { qualifiedTable } from "@/lib/database-schema";
import { createSession } from "./helpers/authenticated-session";
import { createDraftApplication } from "@/lib/applications";
import { postMessageAction } from "@/app/actions/communications";
import { consumeAuthRateLimit } from "@/lib/auth-rate-limit";
import { hashToken } from "@/lib/crypto";
import {listCommunications} from "@/lib/queries";

suiteSetup();
afterEach(() => { request.cookie = ""; });

describe("communication audit integrity", () => {
  it("bounds long histories and traverses tied timestamps without loss or cross-tenant messages",async()=>{
    const actor=await userByEmail("a-admin@test.example");const foreign=await userByEmail("b-admin@test.example");
    const visa=(await db.select().from(visaTypes).limit(1))[0]!;
    const app=await createDraftApplication({agencyId:actor.agencyId!,visaTypeId:visa.id,createdBy:actor});
    await db.insert(communications).values(Array.from({length:125},(_,i)=>({applicationId:app.id,authorId:actor.id,visibility:"AGENCY",body:`Synthetic ${i}`,createdAt:new Date("2026-01-01T00:00:00.000Z")})));
    const seen=new Set<string>();let cursor:string|undefined;
    for(let page=0;page<3;page++){
      const rows=await listCommunications(app.id,actor,cursor);expect(rows.length).toBeLessThanOrEqual(50);
      rows.forEach(row=>{expect(seen.has(row.message.id)).toBe(false);seen.add(row.message.id);});
      cursor=`${rows[0]!.message.createdAt.toISOString()}|${rows[0]!.message.id}`;
    }
    expect(seen.size).toBe(125);expect(await listCommunications(app.id,foreign)).toEqual([]);
    expect(await listCommunications(app.id,actor,"malformed injection'" )).toHaveLength(50);
  });
  it("rolls back a posted message when its audit row cannot be persisted", async () => {
    const agency = await agencyByEmail("ops@agencya.example");
    const actor = await userByEmail("a-admin@test.example");
    const visa = (await db.select().from(visaTypes).limit(1))[0]!;
    const app = await createDraftApplication({ agencyId: agency.id, visaTypeId: visa.id, createdBy: actor });
    request.cookie = (await createSession(actor.id)).token;

    const fn = qualifiedTable("test_fail_message_audit");
    const audit = qualifiedTable("audit_logs");
    await pool.query(`create or replace function ${fn}() returns trigger language plpgsql as $audit$
      begin
        if new.action = 'MESSAGE_POSTED' then
          raise exception 'synthetic message audit failure';
        end if;
        return new;
      end
    $audit$`);
    await pool.query(`drop trigger if exists test_fail_message_audit on ${audit}`);
    await pool.query(`create trigger test_fail_message_audit before insert on ${audit}
      for each row execute function ${fn}()`);

    const form = new FormData();
    form.set("applicationId", app.id);
    form.set("body", "Audit rollback probe");
    try {
      await expect(postMessageAction(form)).rejects.toThrow(/NEXT_REDIRECT/);
      const rows = await db.select().from(communications).where(eq(communications.applicationId, app.id));
      expect(rows).toHaveLength(0);
    } finally {
      await pool.query(`drop trigger if exists test_fail_message_audit on ${audit}`);
      await pool.query(`drop function if exists ${fn}()`);
      await db.delete(applications).where(eq(applications.id, app.id)).catch(() => undefined);
    }
  });
  it("blocks message flooding before another communication is persisted", async () => {
    const agency = await agencyByEmail("ops@agencya.example");
    const actor = await userByEmail("a-admin@test.example");
    const visa = (await db.select().from(visaTypes).limit(1))[0]!;
    const app = await createDraftApplication({ agencyId: agency.id, visaTypeId: visa.id, createdBy: actor });
    request.cookie = (await createSession(actor.id)).token;

    const key = hashToken(`message-user-minute:${actor.id}`);
    await db.delete(authRateLimits).where(eq(authRateLimits.key, key));
    for (let i = 0; i < 20; i += 1) {
      expect(await consumeAuthRateLimit("message-user-minute", actor.id, 20, 60_000)).toBe(true);
    }

    const form = new FormData();
    form.set("applicationId", app.id);
    form.set("body", "Flood attempt must be rejected");
    await expect(postMessageAction(form)).rejects.toThrow(/NEXT_REDIRECT/);

    const rows = await db.select().from(communications).where(eq(communications.applicationId, app.id));
    expect(rows).toHaveLength(0);

    await db.delete(authRateLimits).where(eq(authRateLimits.key, key));
    await db.delete(applications).where(eq(applications.id, app.id)).catch(() => undefined);
  });

});
