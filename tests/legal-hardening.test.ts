import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { suiteSetup } from "./helpers/global-state";
import { resetData } from "./helpers/pg";
import { seedFixtures, userByEmail } from "./helpers/fixtures";
import { db } from "@/lib/db";
import { publishLegalContent, readPublishedLegal } from "@/lib/legal";

suiteSetup();

beforeEach(async () => {
  await resetData();
  await seedFixtures();
  await db.execute(sql`truncate legal_versions`);
});

describe("owner-supplied immutable legal versions", () => {
  it("has no invented legal content or dates", async () => {
    expect(await readPublishedLegal("terms", "ar")).toBeNull();
  });

  it("publishes only through SUPER_ADMIN and keeps immutable history", async () => {
    const admin = await userByEmail("admin@test.example");
    const superAdmin = await userByEmail("superadmin@test.example");
    const agency = await userByEmail("a-admin@test.example");
    const effectiveAt = new Date("2026-10-01T00:00:00.000Z");

    await expect(
      publishLegalContent({
        kind: "terms",
        locale: "fr",
        body: "Texte approuvé fourni pour un test",
        effectiveAt,
        actor: agency,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      publishLegalContent({
        kind: "terms",
        locale: "fr",
        body: "Texte approuvé fourni pour un test",
        effectiveAt,
        actor: admin,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const first = await publishLegalContent({
      kind: "terms",
      locale: "fr",
      body: "Version un fournie pour un test",
      effectiveAt,
      actor: superAdmin,
    });
    const second = await publishLegalContent({
      kind: "terms",
      locale: "fr",
      body: "Version deux fournie pour un test",
      effectiveAt: new Date("2026-10-02T00:00:00.000Z"),
      actor: superAdmin,
    });

    expect(first.publishedAt).toBeInstanceOf(Date);
    expect(first.effectiveAt.toISOString()).toBe(effectiveAt.toISOString());
    expect(second.version).toBe(2);
    expect((await readPublishedLegal("terms", "fr"))?.version).toBe(2);
    expect(
      (await db.execute(sql`select * from legal_versions where kind='terms' and locale='fr'`)).rows,
    ).toHaveLength(2);

    await expect(db.execute(sql`update legal_versions set body='Overwritten'`)).rejects.toThrow();
    expect((await readPublishedLegal("terms", "fr"))?.body).toBe(
      "Version deux fournie pour un test",
    );
  });

  it("does not activate a future effective version before its approved date", async () => {
    const superAdmin = await userByEmail("superadmin@test.example");
    await publishLegalContent({
      kind: "privacy",
      locale: "en",
      body: "Current approved notice",
      effectiveAt: new Date("2026-01-01T00:00:00.000Z"),
      actor: superAdmin,
    });
    await publishLegalContent({
      kind: "privacy",
      locale: "en",
      body: "Future approved notice",
      effectiveAt: new Date("2099-01-01T00:00:00.000Z"),
      actor: superAdmin,
    });

    expect((await readPublishedLegal("privacy", "en"))?.body).toBe(
      "Current approved notice",
    );
  });

  it("deduplicates identical content only when effective date also matches", async () => {
    const superAdmin = await userByEmail("superadmin@test.example");
    const first = await publishLegalContent({
      kind: "terms",
      locale: "ar",
      body: "نص اختبار معتمد",
      effectiveAt: new Date("2026-10-01T00:00:00.000Z"),
      actor: superAdmin,
    });
    const same = await publishLegalContent({
      kind: "terms",
      locale: "ar",
      body: "نص اختبار معتمد",
      effectiveAt: new Date("2026-10-01T00:00:00.000Z"),
      actor: superAdmin,
    });
    const later = await publishLegalContent({
      kind: "terms",
      locale: "ar",
      body: "نص اختبار معتمد",
      effectiveAt: new Date("2026-11-01T00:00:00.000Z"),
      actor: superAdmin,
    });

    expect(same.id).toBe(first.id);
    expect(later.id).not.toBe(first.id);
    expect(later.version).toBe(first.version + 1);
  });
});
