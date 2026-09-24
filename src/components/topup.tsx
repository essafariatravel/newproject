"use client";

/**
 * Wallet top-up UI — §10/§11.
 *
 * One client component for both sides of the flow:
 *   - TopupRequestForm: agency raises a request (amount + optional note) with a
 *     live preview of the resulting balance,
 *   - TopupProcessForm: authorised staff credit or reject a pending request,
 *     with the exact balance movement shown before confirming.
 *
 * Neither form decides anything: all validation, authorisation and money
 * movement happen server-side in the top-up service.
 */
import { useState } from "react";
import { SubmitButton } from "@/components/forms";
import { formatAmount } from "@/lib/format";

export interface TopupCopy {
  amountLabel: string;
  amountPlaceholder: string;
  noteLabel: string;
  notePlaceholder: string;
  submit: string;
  sending: string;
  resultingBalance: string;
  currentBalance: string;
  creditLabel: string;
  rejectLabel: string;
  reasonLabel: string;
  reasonPlaceholder: string;
  confirmCredit: string;
  confirmReject: string;
  processing: string;
  requestedAmount: string;
  creditedAmount: string;
  maxNote: string;
}

export function TopupRequestForm({
  action,
  back,
  currentBalance,
  locale,
  copy,
  disabled,
  disabledReason,
}: {
  action: (formData: FormData) => Promise<void>;
  back: string;
  currentBalance: string;
  locale: "en" | "fr" | "ar";
  copy: TopupCopy;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [amount, setAmount] = useState("");
  const numeric = Number(amount.replace(/[^\d.]/g, ""));
  const valid = Number.isFinite(numeric) && numeric > 0;
  const after = valid ? Number(currentBalance) + numeric : null;

  return (
    <form action={action} className="space-y-3" id="topup">
      <input type="hidden" name="back" value={back} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="topup-amount">
            {copy.amountLabel} *
          </label>
          <input
            id="topup-amount"
            name="amount"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0.01"
            required
            className="input tabular-nums"
            placeholder={copy.amountPlaceholder}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="topup-note">
            {copy.noteLabel}
          </label>
          <input
            id="topup-note"
            name="note"
            maxLength={500}
            className="input"
            placeholder={copy.notePlaceholder}
          />
        </div>
      </div>

      <dl className="grid grid-cols-1 gap-2 rounded-xl border border-line/70 bg-ivory-50/60 p-3 text-sm sm:grid-cols-2">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-slate-500">{copy.currentBalance}</dt>
          <dd className="font-medium tabular-nums text-navy-900">
            {formatAmount(currentBalance, "DZD", locale)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-slate-500">{copy.resultingBalance}</dt>
          <dd className="font-semibold tabular-nums text-navy-900">
            {after === null ? "—" : formatAmount(after.toFixed(2), "DZD", locale)}
          </dd>
        </div>
      </dl>

      {disabled ? (
        <p className="rounded-xl border border-gold-200 bg-gold-50 px-3 py-2 text-xs text-gold-800">{disabledReason}</p>
      ) : null}

      <SubmitButton className="btn-primary" pendingLabel={copy.sending} disabled={disabled}>
        {copy.submit}
      </SubmitButton>
    </form>
  );
}

export function TopupProcessForm({
  action,
  back,
  requestId,
  requestedAmount,
  agencyBalance,
  locale,
  copy,
}: {
  action: (formData: FormData) => Promise<void>;
  back: string;
  requestId: string;
  requestedAmount: string;
  agencyBalance: string;
  locale: "en" | "fr" | "ar";
  copy: TopupCopy;
}) {
  const [decision, setDecision] = useState<"CREDIT" | "REJECT">("CREDIT");
  const [amount, setAmount] = useState(requestedAmount);
  const numeric = Number(String(amount).replace(/[^\d.]/g, ""));
  const valid = Number.isFinite(numeric) && numeric > 0;
  const after = valid ? Number(agencyBalance) + numeric : null;

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="back" value={back} />
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="decision" value={decision} />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setDecision("CREDIT")}
          className={decision === "CREDIT" ? "btn-primary btn-sm" : "btn-secondary btn-sm"}
          aria-pressed={decision === "CREDIT"}
        >
          {copy.creditLabel}
        </button>
        <button
          type="button"
          onClick={() => setDecision("REJECT")}
          className={decision === "REJECT" ? "btn-danger btn-sm" : "btn-secondary btn-sm"}
          aria-pressed={decision === "REJECT"}
        >
          {copy.rejectLabel}
        </button>
      </div>

      {decision === "CREDIT" ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor={`amount-${requestId}`}>
                {copy.creditedAmount} *
              </label>
              <input
                id={`amount-${requestId}`}
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                max={requestedAmount}
                required
                className="input tabular-nums"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor={`note-${requestId}`}>
                {copy.noteLabel}
              </label>
              <input id={`note-${requestId}`} name="decisionNote" maxLength={500} className="input" placeholder={copy.notePlaceholder} />
            </div>
          </div>
          <dl className="grid grid-cols-1 gap-2 rounded-xl border border-line/70 bg-ivory-50/60 p-3 text-sm sm:grid-cols-3">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-500">{copy.requestedAmount}</dt>
              <dd className="font-medium tabular-nums text-navy-900">{formatAmount(requestedAmount, "DZD", locale)}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-500">{copy.currentBalance}</dt>
              <dd className="font-medium tabular-nums text-navy-900">{formatAmount(agencyBalance, "DZD", locale)}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-500">{copy.resultingBalance}</dt>
              <dd className="font-semibold tabular-nums text-navy-900">
                {after === null ? "—" : formatAmount(after.toFixed(2), "DZD", locale)}
              </dd>
            </div>
          </dl>
          <SubmitButton className="btn-primary btn-sm" pendingLabel={copy.processing}>
            {copy.confirmCredit}
          </SubmitButton>
        </>
      ) : (
        <>
          <div>
            <label className="label" htmlFor={`reason-${requestId}`}>
              {copy.reasonLabel} *
            </label>
            <input
              id={`reason-${requestId}`}
              name="decisionNote"
              required
              minLength={3}
              maxLength={500}
              className="input"
              placeholder={copy.reasonPlaceholder}
            />
          </div>
          <SubmitButton className="btn-danger btn-sm" pendingLabel={copy.processing}>
            {copy.confirmReject}
          </SubmitButton>
        </>
      )}
    </form>
  );
}
