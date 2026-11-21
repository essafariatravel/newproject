import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { siteSettings } from "@/db/schema";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { AppError, isAgencyRole, type AuthUser } from "@/lib/types";

/**
 * Bank coordinates are B2B-only operational data, not public CMS content.
 * Stored in the existing configuration ledger; no schema change required.
 */
export const BANK_ACCOUNTS_SETTING_KEY = "internal.finance.bank_accounts";

export const bankAccountInputSchema = z.object({
  bankName: z.string().trim().min(2).max(120),
  holderName: z.string().trim().min(2).max(160),
  rib: z.string().trim().transform((value) => value.replace(/[\s-]/g, "")).pipe(
    z.string().regex(/^\d{20}$/, "An Algerian RIB must contain exactly 20 digits."),
  ),
});

const savedAccountSchema = bankAccountInputSchema.extend({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
});
export type BankAccount = z.infer<typeof savedAccountSchema>;
export type BankAccountInput = z.input<typeof bankAccountInputSchema>;

export function parseStoredBankAccounts(raw: unknown): BankAccount[] {
  if (raw == null) return [];
  const parsed = z.array(savedAccountSchema).max(20).safeParse(raw);
  if (!parsed.success) throw new AppError("INVALID_STATE", "Bank account settings need administrator review.");
  return parsed.data;
}

function requireBankAccountsReader(actor: AuthUser): void {
  if (actor.mustChangePassword || !(
    (!actor.agencyId && actor.role === "SUPER_ADMIN") ||
    (Boolean(actor.agencyId) && isAgencyRole(actor.role))
  )) {
    throw new AppError("FORBIDDEN", "Bank details are available only to signed-in agencies and the Super Admin.");
  }
}

function requireBankAccountsManager(actor: AuthUser): void {
  if (actor.role !== "SUPER_ADMIN" || actor.agencyId || actor.mustChangePassword) {
    throw new AppError("FORBIDDEN", "Only the Super Admin can manage bank details.");
  }
}

/** Deliberately no public route: callers supply the verified session user. */
export async function listBankAccounts(actor: AuthUser): Promise<BankAccount[]> {
  requireBankAccountsReader(actor);
  const [row] = await db.select({ value: siteSettings.value }).from(siteSettings)
    .where(eq(siteSettings.key, BANK_ACCOUNTS_SETTING_KEY)).limit(1);
  return parseStoredBankAccounts(row?.value);
}

async function updateBankAccounts(
  actor: AuthUser,
  mutate: (items: BankAccount[]) => { items: BankAccount[]; action: "BANK_ACCOUNT_ADDED" | "BANK_ACCOUNT_REMOVED"; account: BankAccount },
): Promise<BankAccount> {
  requireBankAccountsManager(actor);
  return db.transaction(async (tx) => {
    // Prevent lost updates from simultaneous owner add/remove requests, even
    // when the configuration row has not been created yet.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('essafaria-bank-accounts'))`);
    const [saved] = await tx.select({ value: siteSettings.value }).from(siteSettings)
      .where(eq(siteSettings.key, BANK_ACCOUNTS_SETTING_KEY)).limit(1);
    const change = mutate(parseStoredBankAccounts(saved?.value));
    await tx.insert(siteSettings).values({
      key: BANK_ACCOUNTS_SETTING_KEY,
      value: change.items,
      updatedBy: actor.id,
    }).onConflictDoUpdate({
      target: siteSettings.key,
      set: { value: change.items, updatedBy: actor.id, updatedAt: new Date() },
    });
    // Keep a durable immutable audit record, without copying the full RIB.
    await recordAudit({
      actor,
      action: change.action,
      entity: "bank_account",
      entityId: change.account.id,
      metadata: {
        bankName: change.account.bankName,
        holderName: change.account.holderName,
        ribLast4: change.account.rib.slice(-4),
      },
    }, tx);
    return change.account;
  });
}

export async function addBankAccount(actor: AuthUser, input: BankAccountInput): Promise<BankAccount> {
  requireBankAccountsManager(actor);
  const data = bankAccountInputSchema.parse(input);
  return updateBankAccounts(actor, (existing) => {
    if (existing.some((account) => account.rib === data.rib)) {
      throw new AppError("DUPLICATE", "This RIB is already registered.");
    }
    if (existing.length >= 20) throw new AppError("LIMIT", "The bank account limit has been reached.");
    const account: BankAccount = {
      id: randomUUID(), ...data, createdAt: new Date().toISOString(),
    };
    return { items: [...existing, account], account, action: "BANK_ACCOUNT_ADDED" };
  });
}

export async function removeBankAccount(actor: AuthUser, id: string): Promise<void> {
  requireBankAccountsManager(actor);
  if (!z.string().uuid().safeParse(id).success) throw new AppError("INVALID_ID", "Invalid account identifier.");
  await updateBankAccounts(actor, (existing) => {
    const account = existing.find((item) => item.id === id);
    if (!account) throw new AppError("NOT_FOUND", "This bank account is no longer listed.");
    return {
      items: existing.filter((item) => item.id !== id),
      account,
      action: "BANK_ACCOUNT_REMOVED",
    };
  });
}
