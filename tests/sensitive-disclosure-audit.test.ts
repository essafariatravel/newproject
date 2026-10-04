import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { suiteSetup } from "./helpers/global-state";
import { request } from "./helpers/request";
import { userByEmail } from "./helpers/fixtures";
import { db } from "@/lib/db";
import { checklistItems, visaTypes } from "@/db/schema";
import { createSession } from "@/lib/auth";
import { createDraftApplication } from "@/lib/applications";
import { uploadDocument } from "@/lib/documents";
import { registrationPdf } from "./helpers/fixtures";
import { GET as downloadDossierFile } from "@/app/api/documents/[id]/route";

suiteSetup();
afterEach(async () => {
  request.cookie = "";
  await db.execute(sql`drop trigger if exists test_fail_disclosure_audit on audit_logs`);
  await db.execute(sql`drop function if exists test_fail_disclosure_audit()`);
});

describe("sensitive disclosure audit policy", () => {
  it("refuses private dossier bytes when access audit persistence fails", async () => {
    const actor = await userByEmail("a-admin@test.example");
    const [visa] = await db.select().from(visaTypes).where(eq(visaTypes.code, "FR-SCH-TOUR"));
    const app = await createDraftApplication({ agencyId: actor.agencyId!, visaTypeId: visa!.id, createdBy: actor });
    const [item] = await db.select().from(checklistItems).where(eq(checklistItems.applicationId, app.id));
    const doc = await uploadDocument({
      applicationId: app.id,
      actor,
      checklistItemId: item!.id,
      file: registrationPdf(),
    });

    await db.execute(sql.raw(`create function test_fail_disclosure_audit() returns trigger language plpgsql as $audit_disclosure$
      begin
        if new.action = 'DOCUMENT_DOWNLOADED' then
          raise exception 'synthetic disclosure audit failure';
        end if;
        return new;
      end
    $audit_disclosure$`));
    await db.execute(sql`create trigger test_fail_disclosure_audit before insert on audit_logs
      for each row execute function test_fail_disclosure_audit()`);

    request.cookie = (await createSession(actor.id)).token;
    const response = await downloadDossierFile(
      new Request(`http://localhost/api/documents/${doc.id}`),
      { params: Promise.resolve({ id: doc.id }) },
    );
    expect(response.status).toBe(503);
    expect(response.headers.get("content-disposition")).toBeNull();
    expect(await response.json()).toMatchObject({ error: "Service temporarily unavailable." });
  });

  it("keeps every high-value disclosure on strict audit", () => {
    const routes = [
      "src/app/api/documents/[id]/route.ts",
      "src/app/api/registrations/[id]/documents/[docId]/route.ts",
      "src/app/api/topups/[id]/proof/route.ts",
      "src/app/api/admin/applications/export/route.ts",
      "src/app/api/admin/reports/export/route.ts",
      "src/app/api/agency/wallet/export/route.ts",
      "src/app/api/agency/wallet/statement/route.ts",
    ];
    for (const route of routes) {
      const source = readFileSync(route, "utf8");
      expect(source, `${route} must fail closed when disclosure audit cannot persist`).toContain("recordAuditStrict");
    }
  });
});
