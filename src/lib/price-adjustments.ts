/**
 * Phase 2.2 §17/§18 — staff-only price adjustments on submitted applications.
 *
 * Hard rules implemented here (and enforced in SQL where possible):
 *  - the ORIGINAL wallet charge is never modified or deleted; every adjustment
 *    is a NEW compensating ledger row (COMMERCIAL_DISCOUNT | COMMERCIAL_SURCHARGE)
 *  - submitted_price / submitted_currency are immutable snapshots; effective_price
 *    moves and its full adjustment history is preserved
 *  - currency always equals the application's submitted currency (client-provided
 *    currency is ignored/validated, never trusted)
 *  - effective price can never go negative
 *  - idempotent by idempotencyKey (unique partial index); safe against
 *    concurrent adjustment bursts through the application row lock
 *  - RBAC: ESSAFARIA staff with applications.pricing.adjust only — agency-side
 *    actors are refused before any write
 */
import { pool } from "@/lib/db";
import { qualifiedTable } from "@/lib/database-schema";
import { recordAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/rbac";
import { AppError, type AuthUser } from "@/lib/types";

export type AdjustmentType = "DISCOUNT" | "SURCHARGE" | "REFUND";
export const ADJUSTMENT_TYPES: readonly AdjustmentType[] = ["DISCOUNT", "SURCHARGE", "REFUND"];

export interface PriceAdjustmentRow {
  id: string;
  applicationId: string;
  type: AdjustmentType;
  amount: string;
  currency: string;
  reason: string;
  effectiveBefore: string;
  effectiveAfter: string;
  walletTransactionId: string;
  actorId: string;
  actorName: string | null;
  idempotencyKey: string | null;
  createdAt: Date;
}

export interface ApplicationPricing {
  applicationId: string;
  reference: string;
  agencyId: string;
  submittedPrice: string | null;
  submittedCurrency: string | null;
  effectivePrice: string | null;
  adjustments: PriceAdjustmentRow[];
}

/** Full pricing dossier for one application (submitted + adjustments + effective). */
export async function getApplicationPricing(applicationId: string): Promise<ApplicationPricing | null> {
  const res = await pool.query<{
    id: string; reference: string; agency_id: string; submitted_price: string | null; submitted_currency: string | null; effective_price: string | null;
  }>(
    `select id, reference, agency_id, submitted_price::text, submitted_currency, effective_price::text
       from ${qualifiedTable("applications")} where id = $1`,
    [applicationId],
  );
  const app = res.rows[0];
  if (!app) return null;
  const adj = await pool.query<{
    id: string; application_id: string; type: AdjustmentType; amount: string; currency: string; reason: string;
    effective_before: string; effective_after: string; wallet_transaction_id: string; actor_id: string; actor_name: string | null;
    idempotency_key: string | null; created_at: Date;
  }>(
    `select a.id, a.application_id, a.type, a.amount::text, a.currency, a.reason,
            a.effective_before::text, a.effective_after::text, a.wallet_transaction_id,
            a.actor_id, u.name as actor_name, a.idempotency_key, a.created_at
       from ${qualifiedTable("application_price_adjustments")} a
       left join ${qualifiedTable("users")} u on u.id = a.actor_id
      where a.application_id = $1
      order by a.created_at asc, a.id asc`,
    [applicationId],
  );
  return {
    applicationId: app.id,
    reference: app.reference,
    agencyId: app.agency_id,
    submittedPrice: app.submitted_price,
    submittedCurrency: app.submitted_currency,
    effectivePrice: app.effective_price,
    adjustments: adj.rows.map((r) => ({
      id: r.id,
      applicationId: r.application_id,
      type: r.type,
      amount: r.amount,
      currency: r.currency,
      reason: r.reason,
      effectiveBefore: r.effective_before,
      effectiveAfter: r.effective_after,
      walletTransactionId: r.wallet_transaction_id,
      actorId: r.actor_id,
      actorName: r.actor_name,
      idempotencyKey: r.idempotency_key,
      createdAt: r.created_at,
    })),
  };
}

export interface ApplyPriceAdjustmentResult {
  adjustmentId: string;
  /** true when the idempotency key replayed an earlier adjustment — nothing was written twice */
  replayed: boolean;
  effectiveBefore: string;
  effectiveAfter: string;
  walletTransactionId: string;
}

const WALLET_TYPE: Record<AdjustmentType, "COMMERCIAL_DISCOUNT" | "COMMERCIAL_SURCHARGE"> = {
  DISCOUNT: "COMMERCIAL_DISCOUNT",
  REFUND: "COMMERCIAL_DISCOUNT",
  SURCHARGE: "COMMERCIAL_SURCHARGE",
};
const WALLET_REASON: Record<AdjustmentType, (ref: string) => string> = {
  DISCOUNT: (ref) => `Commercial discount — application ${ref}`,
  REFUND: (ref) => `Commercial discount/refund — application ${ref}`,
  SURCHARGE: (ref) => `Commercial surcharge — application ${ref}`,
};

/**
 * Apply a staff price adjustment. Atomic, idempotent, concurrency-safe.
 * @throws AppError codes: FORBIDDEN / NOT_FOUND / VALIDATION / BAD_STATE /
 *         IMPOSSIBLE_PRICE / INSUFFICIENT_FUNDS / DUPLICATE_REF_BUCKET
 */
export async function applyPriceAdjustment(params: {
  applicationId: string;
  actor: AuthUser;
  type: AdjustmentType;
  /** positive, 2dp; the server never trusts a client-computed effective price */
  amount: number | string;
  reason: string;
  idempotencyKey?: string | null;
}): Promise<ApplyPriceAdjustmentResult> {
  // ---- stage 0: RBAC (agency-side and unprivileged staff stop here) ----
  requirePermission(params.actor, "applications.pricing.adjust");

  if (!ADJUSTMENT_TYPES.includes(params.type)) {
    throw new AppError("VALIDATION", "Adjustment type must be DISCOUNT, SURCHARGE or REFUND.");
  }
  const reason = params.reason.trim();
  if (reason.length < 8) {
    throw new AppError("VALIDATION", "A reason of at least 8 characters is mandatory.");
  }
  const amountNum = Number(params.amount);
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    throw new AppError("VALIDATION", "The adjustment amount must be a positive number.");
  }
  const amountStr = amountNum.toFixed(2);
  if (Math.abs(amountNum - Number(amountStr)) > 1e-9) {
    throw new AppError("VALIDATION", "Amounts are limited to 2 decimal places.");
  }
  const key = params.idempotencyKey?.trim() || null;

  const client = await pool.connect();
  try {
    await client.query("begin");

    // ---- idempotent replay: same key → return the original adjustment ----
    if (key) {
      const existing = await client.query<{
        id: string; effective_before: string; effective_after: string; wallet_transaction_id: string;
      }>(
        `select id, effective_before::text, effective_after::text, wallet_transaction_id
           from ${qualifiedTable("application_price_adjustments")} where idempotency_key = $1 for update`,
        [key],
      );
      const found = existing.rows[0];
      if (found) {
        await client.query("commit");
        return {
          adjustmentId: found.id,
          replayed: true,
          effectiveBefore: found.effective_before,
          effectiveAfter: found.effective_after,
          walletTransactionId: found.wallet_transaction_id,
        };
      }
    }

    // ---- stage 1: lock the application (serializes adjustments on it) ----
    const appRes = await client.query<{
      id: string; reference: string; agency_id: string; submitted_price: string | null; submitted_currency: string | null;
      effective_price: string | null; submitted_at: Date | null; cancelled: boolean;
    }>(
      `select a.id, a.reference, a.agency_id,
              a.submitted_price::text, a.submitted_currency, a.effective_price::text,
              a.submitted_at,
              (select s.code = 'CANCELLED' from ${qualifiedTable("statuses")} s where s.id = a.status_id) as cancelled
         from ${qualifiedTable("applications")} a
        where a.id = $1 for update`,
      [params.applicationId],
    );
    const app = appRes.rows[0];
    if (!app) throw new AppError("NOT_FOUND", "Application not found.");
    if (!app.submitted_at || app.submitted_price === null || app.submitted_currency === null) {
      throw new AppError("BAD_STATE", "Price adjustments are only possible AFTER submission.");
    }
    if (app.cancelled) {
      throw new AppError("BAD_STATE", "Cancelled applications cannot receive price adjustments.");
    }

    // ---- stage 2: server-side computation; never trust client math ----
    const before = Number(app.effective_price ?? app.submitted_price);
    const delta = params.type === "SURCHARGE" ? Number(amountStr) : -Number(amountStr);
    const after = Number((before + delta).toFixed(2));
    if (after < 0) {
      throw new AppError(
        "IMPOSSIBLE_PRICE",
        `This ${params.type.toLowerCase()} would push the effective price below zero (current: ${before.toFixed(2)} ${app.submitted_currency}).`,
      );
    }

    // ---- stage 3: compensating immutable wallet entry (original debit untouched) ----
    const isCredit = params.type !== "SURCHARGE";
    const walletUpd = await client.query<{ balance_after: string; balance_before: string }>(
      isCredit
        ? `update ${qualifiedTable("agencies")}
              set balance = balance + $2::numeric, updated_at = now()
            where id = $1
            returning balance::text as balance_after, (balance - $2::numeric)::text as balance_before`
        : `update ${qualifiedTable("agencies")}
              set balance = balance - $2::numeric, updated_at = now()
            where id = $1 and balance >= $2::numeric
            returning balance::text as balance_after, (balance + $2::numeric)::text as balance_before`,
      [app.agency_id, amountStr],
    );
    if (!walletUpd.rows[0]) {
      throw new AppError(
        "INSUFFICIENT_FUNDS",
        `The agency wallet cannot cover this surcharge of ${amountStr} ${app.submitted_currency}.`,
      );
    }
    const { balance_before, balance_after } = walletUpd.rows[0];
    const txRes = await client.query<{ id: string }>(
      `insert into ${qualifiedTable("wallet_transactions")}
         (agency_id, application_id, type, amount, currency, balance_before, balance_after, reason, actor_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       returning id`,
      [
        app.agency_id,
        app.id,
        WALLET_TYPE[params.type],
        amountStr,
        app.submitted_currency,
        balance_before,
        balance_after,
        `${WALLET_REASON[params.type](app.reference)} — ${reason}`,
        params.actor.id,
      ],
    );
    const walletTxId = txRes.rows[0]!.id;

    // ---- stage 4: effective price moves; snapshot columns untouched ----
    await client.query(
      `update ${qualifiedTable("applications")} set effective_price = $2::numeric, updated_at = now() where id = $1`,
      [app.id, after.toFixed(2)],
    );

    // ---- stage 5: the immutable adjustment record ----
    const adjRes = await client.query<{ id: string }>(
      `insert into ${qualifiedTable("application_price_adjustments")}
         (application_id, type, amount, currency, reason, effective_before, effective_after,
          wallet_transaction_id, actor_id, idempotency_key)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       returning id`,
      [
        app.id, params.type, amountStr, app.submitted_currency, reason,
        before.toFixed(2), after.toFixed(2), walletTxId, params.actor.id, key,
      ],
    );
    const adjustmentId = adjRes.rows[0]!.id;

    await client.query("commit");

    // Audit AFTER the commit (same pattern as submitApplication): a writing
    // failure here never produces a phantom wallet reversal.
    await recordAudit({
      actor: params.actor,
      action: "PRICE_ADJUSTED",
      entity: "application",
      entityId: app.id,
      agencyId: app.agency_id,
      metadata: {
        reference: app.reference,
        type: params.type,
        amount: amountStr,
        currency: app.submitted_currency,
        reason,
        effectiveBefore: before.toFixed(2),
        effectiveAfter: after.toFixed(2),
        walletTransactionId: walletTxId,
        adjustmentId,
        idempotencyKey: key,
      },
    });

    return {
      adjustmentId,
      replayed: false,
      effectiveBefore: before.toFixed(2),
      effectiveAfter: after.toFixed(2),
      walletTransactionId: walletTxId,
    };
  } catch (err) {
    await client.query("rollback").catch(() => {});
    if (err instanceof AppError) throw err;
    if (String((err as Error).message).includes("price_adjustments_idempotency_uq")) {
      throw new AppError("DUPLICATE_REF_BUCKET", "This adjustment was already applied (idempotency key in use).");
    }
    throw err;
  } finally {
    client.release();
  }
}
