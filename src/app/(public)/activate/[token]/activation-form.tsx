"use client";

import { TurnstileField, useProtectedAction } from "@/components/turnstile-field";
import type { TurnstilePublicConfig } from "@/lib/turnstile-config";
import { activateAccountAction, type ActivationFormState } from "@/app/actions/activation";
import type { RegistrationCopy, RegistrationLocale } from "@/lib/i18n";
import { PasswordField, Spinner } from "@/components/forms";

export default function ActivationForm(props: {
  token: string;
  locale: RegistrationLocale;
  copy: RegistrationCopy;
  botConfig: TurnstilePublicConfig;
  /** Localized show/hide labels so the affordance never appears in English on a FR/AR page. */
  showLabel?: string;
  hideLabel?: string;
}) {
  const { copy, locale, token, botConfig } = props;
  const { state, formAction, pending, verified, setVerified, challenge } =
    useProtectedAction<ActivationFormState>(activateAccountAction, {}, botConfig, locale);

  return (
    <form action={formAction} onReset={event => event.preventDefault()} className="mt-6 space-y-4">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="locale" value={locale} />
      {state.error ? (
        <div role="alert" className="rounded-2xl border border-red-100 bg-red-50 px-4 py-4 text-base text-red-700">
          {state.error}
        </div>
      ) : null}
      <PasswordField
        id="activation-password"
        name="password"
        label={copy.activation.passwordLabel}
        required
        minLength={10}
        autoComplete="new-password"
        hint={copy.activation.passwordHint}
        showLabel={props.showLabel}
        hideLabel={props.hideLabel}
      />
      <PasswordField
        id="activation-password-confirm"
        name="passwordConfirm"
        label={copy.activation.confirmLabel}
        required
        minLength={10}
        autoComplete="new-password"
        hint={copy.activation.passwordHint}
        showLabel={props.showLabel}
        hideLabel={props.hideLabel}
      />
      <TurnstileField ref={challenge} config={botConfig} action="account_activation" locale={locale} onVerified={setVerified} />
      <button type="submit" disabled={pending || !verified} className="btn-gold w-full px-6 py-2">
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
