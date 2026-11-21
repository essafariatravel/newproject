import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLogs, siteSettings } from "@/db/schema";
import { suiteSetup } from "./helpers/global-state";
import { userByEmail } from "./helpers/fixtures";
import { getSiteSettings } from "@/lib/settings";
import { getBalance } from "@/lib/wallet";
import {
  BANK_ACCOUNTS_SETTING_KEY,
  bankAccountInputSchema, addBankAccount, removeBankAccount, listBankAccounts,
} from "@/lib/bank-accounts";
import { bankAccountCopy } from "@/lib/bank-accounts-copy";

suiteSetup();

const RIB_ONE = "00100001000000000001";
const RIB_TWO = "00100001000000000002";
const RIB_THREE = "00100001000000000003";

describe("Bank transfer details — Super Admin managed, agency-visible", () => {
  it("validates the Algerian 20-digit RIB and all localized copy", () => {
    expect(bankAccountInputSchema.parse({
      bankName: "Banque Test", holderName: "Ali Benali", rib: "001 00001 0000000000 01",
    }).rib).toBe(RIB_ONE);
    for (const rib of ["123", "1234abc", "000000000000000000001", ""]) {
      expect(bankAccountInputSchema.safeParse({ bankName: "Banque Test", holderName: "Ali Benali", rib }).success).toBe(false);
    }
    for (const locale of ["en", "fr", "ar"] as const) {
      const copy = bankAccountCopy(locale);
      expect(copy.title.length).toBeGreaterThan(4);
      expect(copy.remove.length).toBeGreaterThan(1);
      expect(copy.intro.length).toBeGreaterThan(25);
    }
  });

  it("stores a single account, shows it to both agency roles, and never leaks via public CMS settings", async () => {
    const owner = await userByEmail("superadmin@test.example");
    const agencyAdmin = await userByEmail("a-admin@test.example");
    const agencyUser = await userByEmail("a-user@test.example");
    const staff = await userByEmail("admin@test.example");
    const initialBalance = await getBalance(agencyAdmin.agencyId!);
    expect(await listBankAccounts(owner)).toHaveLength(0);

    await expect(addBankAccount(staff, { bankName: "Test", holderName: "Ali Benali", rib: RIB_ONE }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(addBankAccount(agencyAdmin, { bankName: "Test", holderName: "Ali Benali", rib: RIB_ONE }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listBankAccounts(staff)).rejects.toMatchObject({ code: "FORBIDDEN" });

    const saved = await addBankAccount(owner, {
      bankName: "Banque Test", holderName: "Ali Benali", rib: RIB_ONE,
    });
    expect(saved.rib).toBe(RIB_ONE);
    expect((await listBankAccounts(agencyAdmin)).map(a => a.id)).toEqual([saved.id]);
    expect((await listBankAccounts(agencyUser)).map(a => a.id)).toEqual([saved.id]);

    const publicSettings = await getSiteSettings();
    expect(publicSettings).not.toHaveProperty(BANK_ACCOUNTS_SETTING_KEY);
    const stored = (await db.select().from(siteSettings)
      .where(eq(siteSettings.key, BANK_ACCOUNTS_SETTING_KEY)))[0];
    expect(stored).toBeTruthy();

    await expect(addBankAccount(owner, { bankName: "Duplicate", holderName: "Ali Benali", rib: RIB_ONE }))
      .rejects.toMatchObject({ code: "DUPLICATE" });
    expect(await listBankAccounts(owner)).toHaveLength(1);

    await expect(removeBankAccount(staff, saved.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(removeBankAccount(agencyAdmin, saved.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await removeBankAccount(owner, saved.id);
    expect(await listBankAccounts(agencyAdmin)).toHaveLength(0);
    await expect(removeBankAccount(owner, saved.id)).rejects.toMatchObject({ code: "NOT_FOUND" });

    const events = await db.select().from(auditLogs).where(eq(auditLogs.entityId, saved.id));
    expect(events.map(e => e.action)).toEqual(expect.arrayContaining(["BANK_ACCOUNT_ADDED", "BANK_ACCOUNT_REMOVED"]));
    expect(JSON.stringify(events)).not.toContain(RIB_ONE);
    expect((await getBalance(agencyAdmin.agencyId!)).balance).toEqual(initialBalance.balance);
  });

  it("serializes concurrent additions without losing any account", async () => {
    const owner = await userByEmail("superadmin@test.example");
    const create = (rib: string) => addBankAccount(owner, {
      bankName: "Banque Test", holderName: "ESSAFARIA", rib,
    });
    const [first, second] = await Promise.all([create(RIB_TWO), create(RIB_THREE)]);
    expect(new Set([first.id, second.id]).size).toBe(2);
    expect((await listBankAccounts(owner)).map(a => a.rib).sort()).toEqual([RIB_TWO, RIB_THREE]);
  });
});
