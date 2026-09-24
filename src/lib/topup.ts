/**
 * Wallet top-up requests — §10.
 *
 * The agency wallet is prepaid and there is NO payment gateway in V1, so an
 * agency that runs out of credit must never hit a dead end. It raises a
 * persisted request; authorised staff review it and credit the wallet through
 * the normal wallet service; the resulting ledger row is linked back to the
 * request.
 *
 * Guarantees enforced here (server-side):
 *   - an agency can only create/see its OWN requests (tenant scoping),
 *   - an agency can never mark its own request processed,
 *   - processing is idempotent: the request is claimed with a conditional
 *     UPDATE inside the same transaction that moves the money, and the ledger
 *     row is linked with a UNIQUE index (one credit ⇔ one request),
 *   - the credit itself goes through `applyWalletMutation` — the single wallet
 *     mutation primitive, so all wallet invariants (no negative balance,
 *     immutable ledger, DZD only) hold identically.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { db, pool } from "@/lib/db";
import {
  agencies,
  applications,
  walletTopupRequests,
  walletTransactions,
} from "@/db/schema";
import { qualifiedTable } from "@/lib/database-schema";
import { AppError, type AuthUser } from "@/lib/types";
import { applyWalletMutation, getBalance } from "@/lib/wallet";
import { recordAudit } from "@/lib/audit";
import { agencyUserIds, notifyUsers, staffUserIds } from "@/lib/notifications";

/** Roles allowed to move money (crediting a processed top-up). */
export const TOPUP_PROCESSING_ROLES = ["SUPER_ADMIN", "ADMIN", "ACCOUNTING"] as const;

export const TOPUP_STATUSES = ["PENDING", "PROCESSED", "REJECTED", "CANCELLED"] as const;
export type TopupStatus = (typeof TOPUP_STATUSES)[number];

export interface TopupRequestRow {
  id: string;
  reference: string;
  agencyId: string;
  amount: string;
  currency: string;
  note: string | null;
  status: string;
  createdAt: Date;
  processedAt: Date | null;
  decisionNote: string | null;
  walletTransactionId: string | null;
  walletReference: string | null;
  requestedByName: string | null;
  processedByName: string | null;
  agencyName?: string | null;
}

/* ------------------------------------------------------------------ */
/* Agency side                                                        */
/* ------------------------------------------------------------------ */

export async function createTopupRequest(params: {
  agencyId: string;
  amount: number;
  note?: string | null;
  actor: AuthUser;
}): Promise<{ id: string; reference: string; amount: string }> {
  const { amount } = params;
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AppError("INVALID_AMOUNT", "Enter a top-up amount greater than zero.");
  }
  if (amount > 100_000_000) {
    throw new AppError("INVALID_AMOUNT", "This amount is too large. Contact ESSAFARIA for large fundings.");
  }
  const amountAbs = (Math.round(amount * 100) / 100).toFixed(2);

  const open = await db
    .select({ id: walletTopupRequests.id, reference: walletTopupRequests.reference })
    .from(walletTopupRequests)
    .where(
      and(
        eq(walletTopupRequests.agencyId, params.agencyId),
        eq(walletTopupRequests.status, "PENDING"),
      ),
    )
    .limit(1);
  if (open[0]) {
    throw new AppError(
      "TOPUP_PENDING",
      `You already have a pending top-up request (${open[0].reference}). ESSAFARIA will process it shortly.`,
    );
  }

  const inserted = await db
    .insert(walletTopupRequests)
    .values({
      agencyId: params.agencyId,
      amount: amountAbs,
      currency: "DZD",
      note: params.note?.trim() || null,
      requestedBy: params.actor.id,
      status: "PENDING",
    })
    .returning({ id: walletTopupRequests.id, reference: walletTopupRequests.reference });

  const row = inserted[0]!;
  await recordAudit({
    actor: params.actor,
    action: "WALLET_TOPUP_REQUESTED",
    entity: "wallet_topup_request",
    entityId: row.id,
    agencyId: params.agencyId,
    metadata: { reference: row.reference, amount: amountAbs, currency: "DZD" },
  });

  const staff = await staffUserIds(["SUPER_ADMIN", "ADMIN", "ACCOUNTING"]);
  await notifyUsers(staff, {
    type: "TOPUP_REQUESTED",
    title: `Wallet top-up request ${row.reference}`,
    body: `${params.actor.agencyName ?? "Agency"} requested ${amountAbs} DZD.`,
    link: "/admin/billing",
    agencyId: params.agencyId,
  });

  return { id: row.id, reference: row.reference, amount: amountAbs };
}

/** Agency-facing list: always scoped to the caller's own agency. */
export async function listTopupRequestsForAgency(agencyId: string, limit = 25): Promise<TopupRequestRow[]> {
  const rows = await db
    .select({
      id: walletTopupRequests.id,
      reference: walletTopupRequests.reference,
      agencyId: walletTopupRequests.agencyId,
      amount: walletTopupRequests.amount,
      currency: walletTopupRequests.currency,
      note: walletTopupRequests.note,
      status: walletTopupRequests.status,
      createdAt: walletTopupRequests.createdAt,
      processedAt: walletTopupRequests.processedAt,
      decisionNote: walletTopupRequests.decisionNote,
      walletTransactionId: walletTopupRequests.walletTransactionId,
      walletReference: walletTransactions.reference,
    })
    .from(walletTopupRequests)
    .leftJoin(walletTransactions, eq(walletTopupRequests.walletTransactionId, walletTransactions.id))
    .where(eq(walletTopupRequests.agencyId, agencyId))
    .orderBy(desc(walletTopupRequests.createdAt))
    .limit(limit);
  return rows.map((r) => ({ ...r, requestedByName: null, processedByName: null }));
}

/* ------------------------------------------------------------------ */
/* Staff side                                                         */
/* ------------------------------------------------------------------ */

export async function listTopupRequests(options?: {
  status?: TopupStatus | "ALL";
  agencyId?: string;
  limit?: number;
}): Promise<TopupRequestRow[]> {
  const conditions = [];
  if (options?.status && options.status !== "ALL") {
    conditions.push(eq(walletTopupRequests.status, options.status));
  }
  if (options?.agencyId) conditions.push(eq(walletTopupRequests.agencyId, options.agencyId));

  const base = db
    .select({
      id: walletTopupRequests.id,
      reference: walletTopupRequests.reference,
      agencyId: walletTopupRequests.agencyId,
      amount: walletTopupRequests.amount,
      currency: walletTopupRequests.currency,
      note: walletTopupRequests.note,
      status: walletTopupRequests.status,
      createdAt: walletTopupRequests.createdAt,
      processedAt: walletTopupRequests.processedAt,
      decisionNote: walletTopupRequests.decisionNote,
      walletTransactionId: walletTopupRequests.walletTransactionId,
      walletReference: walletTransactions.reference,
      agencyName: agencies.legalName,
    })
    .from(walletTopupRequests)
    .innerJoin(agencies, eq(walletTopupRequests.agencyId, agencies.id))
    .leftJoin(walletTransactions, eq(walletTopupRequests.walletTransactionId, walletTransactions.id));

  const rows = await (conditions.length > 0 ? base.where(and(...conditions)) : base)
    .orderBy(desc(walletTopupRequests.createdAt))
    .limit(options?.limit ?? 100);
  return rows.map((r) => ({ ...r, requestedByName: null, processedByName: null }));
}

/**
 * Process a pending request.
 *
 * Everything happens in ONE transaction: claim the request (conditional on
 * status = 'PENDING'), move the money, link the ledger row. If anything fails,
 * nothing changed — and a retry can never double-credit, because the second
 * attempt finds no PENDING row.
 */
export async function processTopupRequest(params: {
  requestId: string;
  actor: AuthUser;
  decision: "CREDIT" | "REJECT";
  decisionNote?: string | null;
  /** Credit amount may be adjusted by staff (partial funding); defaults to the requested amount. */
  amount?: number;
  ipAddress?: string | null;
}): Promise<{
  status: "PROCESSED" | "REJECTED";
  reference: string;
  walletTransactionId: string | null;
  amount: string;
  balanceAfter: string | null;
}> {
  // Authorization lives in the service, not only in the action/page that calls
  // it: agency roles (and VISA_AGENT, which may VIEW wallets but never move
  // money) can never process their own or anyone else's top-up request.
  if (!(TOPUP_PROCESSING_ROLES as readonly string[]).includes(params.actor.role)) {
    throw new AppError("FORBIDDEN", "Your role cannot process wallet top-ups.");
  }

  const note = params.decisionNote?.trim() || null;
  if (params.decision === "REJECT" && !note) {
    throw new AppError("REASON_REQUIRED", "Give a reason for rejecting this top-up request.");
  }

  const client = await pool.connect();
  let outcome: {
    status: "PROCESSED" | "REJECTED";
    reference: string;
    walletTransactionId: string | null;
    amount: string;
    balanceAfter: string | null;
    agencyId: string;
  };
  try {
    await client.query("begin");

    // 1. Claim — FOR UPDATE + status guard makes concurrent processing impossible.
    const claim = await client.query<{
      id: string;
      reference: string;
      agency_id: string;
      amount: string;
      status: string;
      note: string | null;
    }>(
      `select id, reference, agency_id, amount::text as amount, status, note
         from ${qualifiedTable("wallet_topup_requests")}
        where id = $1
        for update`,
      [params.requestId],
    );
    const req = claim.rows[0];
    if (!req) {
      await client.query("rollback");
      throw new AppError("NOT_FOUND", "Top-up request not found.");
    }
    if (req.status !== "PENDING") {
      await client.query("rollback");
      throw new AppError(
        "TOPUP_ALREADY_PROCESSED",
        `Top-up request ${req.reference} was already ${req.status.toLowerCase()}.`,
      );
    }

    if (params.decision === "REJECT") {
      await client.query(
        `update ${qualifiedTable("wallet_topup_requests")}
            set status = 'REJECTED', decision_note = $2, processed_by = $3,
                processed_at = now(), updated_at = now()
          where id = $1 and status = 'PENDING'`,
        [req.id, note, params.actor.id],
      );
      await client.query("commit");
      outcome = {
        status: "REJECTED",
        reference: req.reference,
        walletTransactionId: null,
        amount: req.amount,
        balanceAfter: null,
        agencyId: req.agency_id,
      };
    } else {
      const requested = Number(req.amount);
      const credit = params.amount === undefined ? requested : params.amount;
      if (!Number.isFinite(credit) || credit <= 0) {
        await client.query("rollback");
        throw new AppError("INVALID_AMOUNT", "Credit amount must be greater than zero.");
      }
      if (credit > requested) {
        await client.query("rollback");
        throw new AppError(
          "INVALID_AMOUNT",
          `Credit cannot exceed the requested amount (${requested} DZD). Raise a wallet adjustment instead.`,
        );
      }
      const amountAbs = (Math.round(credit * 100) / 100).toFixed(2);

      // 2. Move the money through the single wallet primitive.
      const mutation = await applyWalletMutation(client, {
        agencyId: req.agency_id,
        operation: "CREDIT",
        amountAbs,
        reason: `Wallet top-up ${req.reference}`,
        actorId: params.actor.id,
      });

      // 3. Link + close the request (unique index guarantees 1:1).
      const updated = await client.query<{ id: string }>(
        `update ${qualifiedTable("wallet_topup_requests")}
            set status = 'PROCESSED', wallet_transaction_id = $2, decision_note = $3,
                processed_by = $4, processed_at = now(), updated_at = now()
          where id = $1 and status = 'PENDING'
          returning id`,
        [req.id, mutation.transactionId, note ?? `Credited ${amountAbs} DZD.`, params.actor.id],
      );
      if (!updated.rows[0]) {
        await client.query("rollback");
        throw new AppError("TOPUP_ALREADY_PROCESSED", `Top-up request ${req.reference} was already processed.`);
      }

      await client.query(
        `insert into ${qualifiedTable("audit_logs")}
           (actor_id, actor_email, actor_role, agency_id, action, entity, entity_id, metadata, ip_address)
         values ($1, $2, $3, $4, 'WALLET_TOPUP_PROCESSED', 'wallet_topup_request', $5, $6::jsonb, $7)`,
        [
          params.actor.id,
          params.actor.email,
          params.actor.role,
          req.agency_id,
          req.id,
          JSON.stringify({
            reference: req.reference,
            amount: amountAbs,
            currency: "DZD",
            walletTransactionId: mutation.transactionId,
            walletReference: mutation.reference,
            balanceBefore: mutation.balanceBefore,
            balanceAfter: mutation.balanceAfter,
          }),
          params.ipAddress ?? null,
        ],
      );
      await client.query("commit");
      outcome = {
        status: "PROCESSED",
        reference: req.reference,
        walletTransactionId: mutation.transactionId,
        amount: amountAbs,
        balanceAfter: mutation.balanceAfter,
        agencyId: req.agency_id,
      };
    }
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  // Notifications + audit are best-effort post-commit side effects.
  if (params.decision === "REJECT") {
    await recordAudit({
      actor: params.actor,
      action: "WALLET_TOPUP_REJECTED",
      entity: "wallet_topup_request",
      entityId: params.requestId,
      agencyId: outcome.agencyId,
      metadata: { reference: outcome.reference, reason: note },
      ipAddress: params.ipAddress ?? null,
    });
  }

  const recipients = await agencyUserIds(outcome.agencyId);
  await notifyUsers(recipients, {
    type: "WALLET_TOPUP_DECIDED",
    title:
      outcome.status === "PROCESSED"
        ? `Wallet topped up — ${outcome.amount} DZD`
        : "Wallet top-up request rejected",
    body:
      outcome.status === "PROCESSED"
        ? `Request ${outcome.reference} was credited to your wallet.`
        : `Request ${outcome.reference} was rejected. ${note ?? ""}`.trim(),
    link: "/portal/wallet",
    agencyId: outcome.agencyId,
  });

  return {
    status: outcome.status,
    reference: outcome.reference,
    walletTransactionId: outcome.walletTransactionId,
    amount: outcome.amount,
    balanceAfter: outcome.balanceAfter,
  };
}

/** Staff dashboard indicator. */
export async function countPendingTopups(): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(walletTopupRequests)
    .where(eq(walletTopupRequests.status, "PENDING"));
  return rows[0]?.count ?? 0;
}

/** Context used by the submission screen to explain a shortfall precisely. */
export async function topupShortfall(
  agencyId: string,
  required: number,
): Promise<{ balance: string; missing: number; pendingReference: string | null }> {
  const balance = await getBalance(agencyId);
  const current = Number(balance.balance);
  const missing = Math.max(0, Math.round((required - current) * 100) / 100);
  const pending = await db
    .select({ reference: walletTopupRequests.reference })
    .from(walletTopupRequests)
    .where(and(eq(walletTopupRequests.agencyId, agencyId), eq(walletTopupRequests.status, "PENDING")))
    .limit(1);
  return { balance: balance.balance, missing, pendingReference: pending[0]?.reference ?? null };
}

/** Guard used by the submission wizard UI (and tests) for "is this bookable". */
export async function topupRequestById(id: string) {
  const rows = await db.select().from(walletTopupRequests).where(eq(walletTopupRequests.id, id)).limit(1);
  return rows[0] ?? null;
}

/** Used by the agency wallet page to show the applications linked to credits. */
export async function topupApplicationsFor(agencyId: string) {
  return db
    .select({ id: applications.id, reference: applications.reference })
    .from(applications)
    .where(eq(applications.agencyId, agencyId))
    .limit(1);
}
