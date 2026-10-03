import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { suiteSetup } from "./helpers/global-state";
import { request } from "./helpers/request";
import { agencyByEmail, userByEmail } from "./helpers/fixtures";
import { db, pool } from "@/lib/db";
import { applications, communications, visaTypes } from "@/db/schema";
import { qualifiedTable } from "@/lib/database-schema";
import { createSession } from "@/lib/auth";
import { createDraftApplication } from "@/lib/applications";
import { postMessageAction } from "@/app/actions/communications";

suiteSetup();
afterEach(() => { request.cookie = ""; });

describe("communication audit integrity", () => {
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
});
