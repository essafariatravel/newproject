import { describe, expect, it } from "vitest";
import { suiteSetup } from "./helpers/global-state";

suiteSetup();

import { readFileSync } from "node:fs";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { searchApplications } from "@/lib/queries";
import { agencyByEmail, userByEmail } from "./helpers/fixtures";
import { createDraftApplication } from "@/lib/applications";

describe("Phase 2.3 — Bug 14: DRAFT/CANCELLED hidden from agency default list", () => {
  it("legacy drafts exist for the agency and stay reachable ONLY via explicit status filter", async () => {
    const agency = await agencyByEmail("ops@agencyb.example");
    const creator = await userByEmail("b-admin@test.example");
    const visaTypeId = ((await db.execute(sql`select id from visa_types limit 1`)).rows[0] as { id: string }).id;
    const draft = await createDraftApplication({ agencyId: agency.id, visaTypeId, createdBy: creator });

    // default list: hidden
    const def = await searchApplications({ ...creator, agencyId: agency.id } as never, { page: 1 });
    expect(def.rows.some((r) => r.app.id === draft.id)).toBe(false);

    // explicit filter: visible
    const filtered = await searchApplications({ ...creator, agencyId: agency.id } as never, { statusCode: "DRAFT", page: 1 });
    expect(filtered.rows.some((r) => r.app.id === draft.id)).toBe(true);

    // staff list is unaffected (back-office sees everything)
    const staff = await userByEmail("admin@test.example");
    const staffView = await searchApplications(staff, { statusCode: "DRAFT", page: 1 });
    expect(staffView.rows.some((r) => r.app.id === draft.id)).toBe(true);
  });

  it("portal status filter dropdown no longer offers DRAFT / CANCELLED", () => {
    const src = readFileSync("src/app/portal/applications/page.tsx", "utf8");
    expect(src).toContain('.filter((s) => !["DRAFT", "CANCELLED"].includes(s.code))');
    const q = readFileSync("src/lib/queries.ts", "utf8");
    expect(q).toContain('notInArray(statuses.code, ["DRAFT", "CANCELLED"])');
  });

  it("legacy rows are preserved in the database (no destructive cleanup)", async () => {
    const rows = await db.execute(sql`select count(*)::int as n from applications a join statuses s on s.id = a.status_id where s.code = 'DRAFT'`);
    expect((rows.rows[0] as { n: number }).n).toBeGreaterThanOrEqual(1);
  });
});
