import { describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { suiteSetup } from "./helpers/global-state";
import { agencyByEmail, userByEmail } from "./helpers/fixtures";
import { db } from "@/lib/db";
import { applications, visaCategories, visaTypes, walletTransactions } from "@/db/schema";
import { listRequirementsForVisaType, submitVisaRequest } from "@/lib/requests";
import { adjustWallet, getBalance } from "@/lib/wallet";
import { storageProvider } from "@/lib/storage";
import { paymentProof } from "./helpers/payment-proof";

suiteSetup();

async function requestInput() {
  const actor = await userByEmail("a-admin@test.example"), staff = await userByEmail("admin@test.example"), agency = await agencyByEmail("ops@agencya.example");
  const [visa] = await db.select().from(visaTypes).where(eq(visaTypes.code, "JP-BUS"));
  await adjustWallet({ agencyId: agency.id, amount: 1000, actor: staff, reason: "Configuration race funding" });
  const requirements = await listRequirementsForVisaType(visa!.id);
  return { visa: visa!, agency, input: { actor, visaTypeId: visa!.id, countryId: visa!.countryId, idempotencyKey: crypto.randomUUID(), travellers: [{ fullName: "Amina Kaci", nationality: "DZ" }], documents: requirements.filter((item) => item.required).map((item) => ({ documentTypeId: item.documentTypeId, file: paymentProof() })) } };
}

describe("final request confirms current catalogue configuration", () => {
  it("rejects a disabled category before persisting or charging the request", async () => {
    const { visa, agency, input } = await requestInput(), balance = await getBalance(agency.id);
    await db.update(visaCategories).set({ active: false }).where(eq(visaCategories.id, visa.categoryId));
    try {
      await expect(submitVisaRequest(input)).rejects.toMatchObject({ code: "VISA_TYPE_INVALID" });
      expect(await db.select().from(applications).where(eq(applications.idempotencyKey, input.idempotencyKey))).toHaveLength(0);
      expect(await getBalance(agency.id)).toEqual(balance);
    } finally { await db.update(visaCategories).set({ active: true }).where(eq(visaCategories.id, visa.categoryId)); }
  });

  it("rechecks after storage so a concurrent catalogue disable leaves no business rows, charge or orphan files", async () => {
    const { visa, agency, input } = await requestInput(), balance = await getBalance(agency.id);
    const provider = storageProvider(), original = provider.put.bind(provider), keys: string[] = [];
    const staging = vi.spyOn(provider, "put").mockImplementation(async (key, data, type) => {
      await original(key, data, type); keys.push(key);
      if (keys.length === 1) await db.update(visaCategories).set({ active: false }).where(eq(visaCategories.id, visa.categoryId));
    });
    try {
      await expect(submitVisaRequest(input)).rejects.toMatchObject({ code: "VISA_TYPE_INVALID" });
      expect(await db.select().from(applications).where(eq(applications.idempotencyKey, input.idempotencyKey))).toHaveLength(0);
      expect(await db.select().from(walletTransactions).where(eq(walletTransactions.type, "APPLICATION_CHARGE"))).toHaveLength(0);
      expect(await getBalance(agency.id)).toEqual(balance);
      for (const key of keys) expect(((await db.execute(sql`select count(*)::int as n from document_blobs where key=${key}`)).rows[0] as { n: number }).n).toBe(0);
    } finally { staging.mockRestore(); await db.update(visaCategories).set({ active: true }).where(eq(visaCategories.id, visa.categoryId)); }
  });
});
