import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { suiteSetup } from "./helpers/global-state";
import { resetData } from "./helpers/pg";
import { seedFixtures,userByEmail } from "./helpers/fixtures";
import { db } from "@/lib/db";
import { readPublishedLegal,publishLegalContent } from "@/lib/legal";
suiteSetup();
beforeEach(async()=>{await resetData();await seedFixtures();await db.execute(sql`truncate legal_versions`);});
describe("owner supplied immutable legal versions",()=>{
  it("has no invented legal content or dates",async()=>expect(await readPublishedLegal("terms","ar")).toBeNull());
  it("keeps published versions and refuses Agency publication",async()=>{
    const staff=await userByEmail("admin@test.example"),agency=await userByEmail("a-admin@test.example");
    await expect(publishLegalContent({kind:"terms",locale:"fr",body:"Texte approuvé fourni pour un test",publishedAt:new Date(),actor:agency})).rejects.toMatchObject({code:"FORBIDDEN"});
    await publishLegalContent({kind:"terms",locale:"fr",body:"Version un fournie pour un test",publishedAt:new Date(),actor:staff});
    await publishLegalContent({kind:"terms",locale:"fr",body:"Version deux fournie pour un test",publishedAt:new Date(),actor:staff});
    expect((await readPublishedLegal("terms","fr"))?.version).toBe(2);
    expect((await db.execute(sql`select * from legal_versions where kind='terms' and locale='fr'`)).rows).toHaveLength(2);
    await expect(db.execute(sql`update legal_versions set body='Overwritten'`)).rejects.toThrow();
    expect((await readPublishedLegal("terms","fr"))?.body).toBe("Version deux fournie pour un test");
  });
});
