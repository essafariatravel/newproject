import { afterEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLogs, visaTypes } from "@/db/schema";
import { createSession } from "@/lib/auth";
import { updateCountryAction, updateCurrencyAction, updatePriorityAction, updateStatusAction, updateVisaTypeAction } from "@/app/actions/config";
import { suiteSetup } from "./helpers/global-state";
import { userByEmail } from "./helpers/fixtures";
import { request } from "./helpers/request";

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
suiteSetup(); afterEach(() => { request.cookie = ""; });

describe("configuration audit change values", () => {
  it("persists the configured embassy applicability and both audit values through the real editor action", async () => {
    request.cookie = (await createSession((await userByEmail("admin@test.example")).id)).token;
    const [row] = await db.select().from(visaTypes).where(eq(visaTypes.code,"FR-SCH-TOUR"));
    await db.update(visaTypes).set({active:false}).where(eq(visaTypes.id,row!.id));
    const form = new FormData();
    for(const [key,value] of Object.entries({id:row!.id,countryId:row!.countryId,categoryId:row!.categoryId,
      name:row!.name,processingMinDays:String(row!.processingMinDays),processingMaxDays:String(row!.processingMaxDays),fee:row!.fee,embassyApplicability:"APPLICABLE"})) form.set(key,value);
    await expect(updateVisaTypeAction(form)).rejects.toMatchObject({digest:expect.stringContaining("?ok=")});
    expect((await db.select().from(visaTypes).where(eq(visaTypes.id,row!.id)))[0]!.embassyApplicability).toBe("APPLICABLE");
    const [entry]=await db.select().from(auditLogs).where(eq(auditLogs.action,"CONFIG_VISA_TYPE_UPDATED"));
    expect(entry!.metadata).toMatchObject({oldValues:{embassyApplicability:row!.embassyApplicability},newValues:{embassyApplicability:"APPLICABLE"}});
  });
  it.each([
    ["country", "countries", "iso2", "FR", "CONFIG_COUNTRY_UPDATED", updateCountryAction, { iso2: "FR", name: "Updated destination", sortOrder: "20" }],
    ["currency", "currencies", "code", "DZD", "CONFIG_CURRENCY_UPDATED", updateCurrencyAction, { code: "DZD", name: "Updated dinar label", symbol: "DZD", sortOrder: "20" }],
    ["priority", "priorities", "code", "STANDARD", "CONFIG_PRIORITY_UPDATED", updatePriorityAction, { name: "Updated standard label", weight: "0", sortOrder: "20" }],
    ["status", "statuses", "code", "IN_PROCESS", "CONFIG_STATUS_UPDATED", updateStatusAction, { name: "Updated processing label", sortOrder: "20" }],
  ] as const)("persists meaningful before/after values for a %s edit", async (_label, table, key, value, action, edit, fields) => {
    request.cookie = (await createSession((await userByEmail("admin@test.example")).id)).token;
    const row = (await db.execute(sql.raw(`select id,name from ${table} where ${key}='${value}'`))).rows[0] as {id:string;name:string};
    const form = new FormData(); form.set("id", row.id);
    for (const [name, field] of Object.entries(fields)) form.set(name, field);
    await expect(edit(form)).rejects.toMatchObject({ digest: expect.stringContaining("?ok=") });
    const entries = await db.select().from(auditLogs).where(eq(auditLogs.action, action));
    expect(entries).toHaveLength(1);
    expect(entries[0]!.metadata).toMatchObject({ oldValues: { name: row.name }, newValues: { name: fields.name } });
    expect(entries[0]!.actorId).toBe((await userByEmail("admin@test.example")).id);
    expect((await db.execute(sql.raw(`select name from ${table} where ${key}='${value}'`))).rows[0]?.name).toBe(fields.name);
  });
});
