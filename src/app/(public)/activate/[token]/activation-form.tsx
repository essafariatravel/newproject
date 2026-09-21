"use client";

import { useActionState } from "react";
import { activateAccountAction, type ActivationFormState } from "@/app/actions/activation";
import type { RegistrationCopy, RegistrationLocale } from "@/lib/i18n";
import { Spinner } from "@/components/forms";

export default function ActivationForm(props: {
  token: string;
  locale: RegistrationLocale;
  copy: RegistrationCopy;
}) {
  const { copy, locale, token } = props;
  const [state, formAction, pending] = useActionState<ActivationFormState, FormData>(
    activateAccountAction,
    {},
  );

  return (
    <form action={formAction} className="mt-5 space-y-4">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="locale" value={locale} />
      {state.error ? (
        <div role="alert" className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      ) : null}
      <div>
        <label className="label" htmlFor="activation-password">
          {copy.activation.passwordLabel} <span className="text-red-500">*</span>
        </label>
        <input
          id="activation-password"
          name="password"
          type="password"
          required
          minLength={10}
          autoComplete="new-password"
          className="input"
        />
        <p className="mt-1 text-[11px] text-slate-400">{copy.activation.passwordHint}</p>
      </div>
      <div>
        <label className="label" htmlFor="activation-password-confirm">
          {copy.activation.confirmLabel} <span className="text-red-500">*</span>
        </label>
        <input
          id="activation-password-confirm"
          name="passwordConfirm"
          type="password"
          required
          minLength={10}
          autoComplete="new-password"
          className="input"
        />
      </div>
      <button type="submit" disabled={pending} className="btn-gold w-full px-5 py-2.5">
        {pending ? (
          <>
            <Spinner /> {copy.activation.submitPending}
          </>
        ) : (
          copy.activation.submitLabel
        )}
      </button>
    </form>
  );
}
