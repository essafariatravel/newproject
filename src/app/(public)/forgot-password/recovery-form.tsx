"use client";

import { requestRecoveryAction, type RecoveryState } from "@/app/actions/recovery";
import { TurnstileField, useProtectedAction } from "@/components/turnstile-field";
import type { TurnstilePublicConfig } from "@/lib/turnstile-config";
import { SubmitButton } from "@/components/forms";
import { identityT } from "@/lib/identity-copy";
import type { UiLocale } from "@/lib/ui-i18n";

export function RecoveryForm({ locale, botConfig, pendingLabel }: {
  locale: UiLocale;
  botConfig: TurnstilePublicConfig;
  pendingLabel: string;
}) {
  const { state, formAction, pending, verified, setVerified, challenge } = useProtectedAction<RecoveryState>(requestRecoveryAction, {}, botConfig, locale);
  const t = identityT(locale);
  return <form action={formAction} onReset={event => event.preventDefault()} aria-busy={pending} className="access-form">
    <div>
      <label className="label" htmlFor="recovery-identifier">{t("Email")}</label>
      <input id="recovery-identifier" name="identifier" className="input" type="email" required maxLength={254} autoComplete="username" dir="ltr" />
    </div>
    <TurnstileField ref={challenge} config={botConfig} action="account_recovery" locale={locale} onVerified={setVerified} />
    <SubmitButton disabled={!verified} className="access-submit" pendingLabel={pendingLabel}>{t("Request access help")}</SubmitButton>
    {state.error ? <p role="alert" className="access-error">{t(state.error)}</p> : null}
    {state.message ? <p className="access-status" role="status">{t(state.message)}</p> : null}
  </form>;
}
