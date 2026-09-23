import { qualifiedTable } from "./database-schema";
/**
 * Wallet service — the only code path that mutates an agency balance.
 *
 * Safety model (PostgreSQL):
 *  - every mutation runs inside a transaction,
 *  - the balance update uses a conditional atomic UPDATE on the locked row
 *    (`balance >= amount`) which serializes concurrent spenders,
 *  - every mutation writes an immutable ledger row with before/after balances,
 *  - application charges are idempotent via a partial unique index
 *    (one APPLICATION_CHARGE row per application).
 *  - DZD-only: all operational amounts are DZD.
 */
import { and, eq, sql } from "drizzle-orm";
import { db, pool } from "@/lib/db";
import { agencies, applications, walletTransactions } from "@/db/schema";
import { AppError, type AuthUser } from "@/lib/types";
import { recordAudit } from "@/lib/audit";

export interface WalletTx {
  id: string;
  reference?: string;
  agencyId: string;
  applicationId: string | null;
  type: string;
  amount: string;
  currency: string;
  balanceBefore: string;
  balanceAfter: string;
  reason: string;
  createdAt: Date;
}

export function toNumber(money: string): number {
  const n = Number(money);
  if (!Number.isFinite(n)) throw new AppError("MONEY_FORMAT", "Invalid monetary amount.");
  return n;
}

export function formatMoney(money: string, _currency?: string | null, locale: string = "en"): string {
  const n = toNumber(money);
  const nfLocale = locale === "fr" ? "fr-DZ" : locale === "ar" ? "ar-DZ" : "en-DZ";
  try {
    const formatted = new Intl.NumberFormat(nfLocale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(n);
    return `${formatted} DZD`;
  } catch {
    return `${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} DZD`;
  }
}

/** Manual adjustment by an authorized staff member. Returns the ledger row id. */
export async function adjustWallet(params: {
  agencyId: string;
  amount: number;
  reason: string;
  actor: AuthUser;
  ipAddress?: string | null;
  operation?: "CREDIT" | "DEBIT";
}): Promise<string> {
  let operation: "CREDIT" | "DEBIT";
  let amountAbs: string;
  if (params.operation) {
    if (!Number.isFinite(params.amount) || params.amount <= 0) {
      throw new AppError("INVALID_AMOUNT", "Amount must be a positive number.");
    }
    const rounded = Math.round(params.amount * 100) / 100;
    amountAbs = rounded.toFixed(2);
    operation = params.operation;
  } else {
    if (!Number.isFinite(params.amount) || params.amount === 0) {
      throw new AppError("INVALID_AMOUNT", "Amount must be a non-zero number.");
    }
    const rounded = Math.round(params.amount * 100) / 100;
    amountAbs = Math.abs(rounded).toFixed(2);
    operation = rounded > 0 ? "CREDIT" : "DEBIT";
  }
  const credit = operation === "CREDIT";
  const type = credit ? "CREDIT" : "DEBIT";

  const client = await pool.connect();
  try {
    await client.query("begin");
    const upd = await client.query<{ balance_after: string; balance_before: string }>(
      credit
        ? `update ${qualifiedTable("agencies")}
             set balance = balance + $2::numeric, updated_at = now()
           where id = $1
           returning balance::text as balance_after, (balance - $2::numeric)::text as balance_before`
        : `update ${qualifiedTable("agencies")}
             set balance = balance - $2::numeric, updated_at = now()
           where id = $1 and balance >= $2::numeric
           returning balance::text as balance_after, (balance + $2::numeric)::text as balance_before`,
      [params.agencyId, amountAbs],
    );
    if (!upd.rows[0]) {
      await client.query("rollback");
      const agency = await client.query<{ balance: string; currency: string }>(
        `select balance::text as balance, currency from ${qualifiedTable("agencies")} where id = $1`,
        [params.agencyId],
      );
      if (!agency.rows[0]) throw new AppError("NOT_FOUND", "Agency not found.");
      throw new AppError(
        "INSUFFICIENT_FUNDS",
        `Insufficient funds: current balance is ${agency.rows[0].balance} DZD.`,
      );
    }
    const { balance_before, balance_after } = upd.rows[0];
    const tx = await client.query<{ id: string }>(
      `insert into ${qualifiedTable("wallet_transactions")}
         (agency_id, type, amount, currency, balance_before, balance_after, reason, actor_id)
       values ($1, $2, $3, 'DZD', $4, $5, $6, $7)
       returning id`,
      [params.agencyId, type, amountAbs, balance_before, balance_after, params.reason, params.actor.id],
    );
    const txId = tx.rows[0]!.id;
    await client.query("commit");

    await recordAudit({
      actor: params.actor,
      action: credit ? "WALLET_CREDIT" : "WALLET_DEBIT",
      entity: "wallet_transaction",
      entityId: txId,
      agencyId: params.agencyId,
      metadata: { amount: amountAbs, reason: params.reason, balanceBefore: balance_before, balanceAfter: balance_after, currency: "DZD" },
      ipAddress: params.ipAddress ?? null,
    });
    return txId;
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export interface ChargeResult {
  transactionId: string;
  balanceBefore: string;
  balanceAfter: string;
}

export async function chargeApplicationSubmission(params: {
  applicationId: string;
  actorId: string;
  submittedStatusId: string;
  draftStatusId: string;
  ipAddress?: string | null;
}): Promise<ChargeResult> {
  const client = await pool.connect();
  try {
    await client.query("begin");

    const appRes = await client.query<{
      id: string;
      agency_id: string;
      fee: string;
      currency: string;
      reference: string;
      status_id: string;
    }>(
      `select id, agency_id, fee::text as fee, currency, reference, status_id
         from ${qualifiedTable("applications")} where id = $1 for update`,
      [params.applicationId],
    );
    const app = appRes.rows[0];
    if (!app) {
      await client.query("rollback");
      throw new AppError("NOT_FOUND", "Application not found.");
    }
    if (app.status_id !== params.draftStatusId) {
      await client.query("rollback");
      throw new AppError(
        "ALREADY_SUBMITTED",
        `Application ${app.reference} has already been submitted and charged.`,
      );
    }

    const upd = await client.query<{ balance_after: string; balance_before: string }>(
      `update ${qualifiedTable("agencies")}
         set balance = balance - $2::numeric, updated_at = now()
       where id = $1 and balance >= $2::numeric
       returning balance::text as balance_after, (balance + $2::numeric)::text as balance_before`,
      [app.agency_id, app.fee],
    );
    if (!upd.rows[0]) {
      await client.query("rollback");
      const bal = await client.query<{ balance: string; currency: string }>(
        `select balance::text as balance, currency from ${qualifiedTable("agencies")} where id = $1`,
        [app.agency_id],
      );
      throw new AppError(
        "INSUFFICIENT_FUNDS",
        `Wallet balance is too low for this application (${app.fee} DZD required).`,
      );
    }
    const { balance_before, balance_after } = upd.rows[0];

    const txRes = await client.query<{ id: string }>(
      `insert into ${qualifiedTable("wallet_transactions")}
         (agency_id, application_id, type, amount, currency, balance_before, balance_after, reason, actor_id)
       values ($1, $2, 'APPLICATION_CHARGE', $3, 'DZD', $4, $5, $6, $7)
       returning id`,
      [
        app.agency_id,
        app.id,
        app.fee,
        balance_before,
        balance_after,
        `Visa application ${app.reference}`,
        params.actorId,
      ],
    );
    const txId = txRes.rows[0]!.id;

    await client.query(
      `update ${qualifiedTable("applications")}
         set status_id = $2, submitted_at = now(), updated_at = now(),
             submitted_price = fee, submitted_currency = 'DZD', effective_price = fee
       where id = $1`,
      [app.id, params.submittedStatusId],
    );
    await client.query(
      `insert into ${qualifiedTable("application_status_history")}
         (application_id, from_status_id, to_status_id, changed_by, reason)
       values ($1, $2, $3, $4, 'Application submitted')`,
      [app.id, params.draftStatusId, params.submittedStatusId, params.actorId],
    );
    await client.query("commit");
    return { transactionId: txId, balanceBefore: balance_before, balanceAfter: balance_after };
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function getTransactions(agencyId?: string, limit = 100) {
  const q = db
    .select({
      tx: walletTransactions,
      applicationReference: applications.reference,
    })
    .from(walletTransactions)
    .leftJoin(applications, eq(walletTransactions.applicationId, applications.id))
    .orderBy(sql`${walletTransactions.createdAt} desc`)
    .limit(limit);
  const rows = agencyId ? await q.where(eq(walletTransactions.agencyId, agencyId)) : await q;
  return rows;
}

export async function getBalance(agencyId: string): Promise<{ balance: string; currency: string }> {
  const rows = await db
    .select({ balance: agencies.balance, currency: agencies.currency })
    .from(agencies)
    .where(eq(agencies.id, agencyId))
    .limit(1);
  if (!rows[0]) throw new AppError("NOT_FOUND", "Agency not found.");
  // Operational currency is always DZD
  return { balance: rows[0].balance, currency: "DZD" };
}

export async function findTransactionByApplication(applicationId: string) {
  const rows = await db
    .select()
    .from(walletTransactions)
    .where(
      and(
        eq(walletTransactions.applicationId, applicationId),
        eq(walletTransactions.type, "APPLICATION_CHARGE"),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}
