"use client";

import { requestRecoveryAction, type RecoveryState } from "@/app/actions/recovery";
import { TurnstileField, useProtectedAction } from "@/components/turnstile-field";
import type { TurnstilePublicConfig } from "@/lib/turnstile-config";
import { SubmitButton } from "@/components/forms";
import { identityT } from "@/lib/identity-copy";
import type { UiLocale } from "@/lib/ui-i18n";

export function RecoveryForm({ locale, botConfig }: { locale: UiLocale; botConfig: TurnstilePublicConfig }) {
  const { state, formAction, verified, setVerified, challenge } = useProtectedAction<RecoveryState>(requestRecoveryAction, {}, botConfig, locale);
  const t = identityT(locale);
  return <form action={formAction} onReset={event => event.preventDefault()} className="card mt-6 space-y-4 p-6">
    <label className="label" htmlFor="recovery-identifier">{t("Email")}</label>
    <input id="recovery-identifier" name="identifier" className="input" type="email" required maxLength={254} autoComplete="username" dir="ltr" />
    <TurnstileField ref={challenge} config={botConfig} action="account_recovery" locale={locale} onVerified={setVerified} />
    <SubmitButton disabled={!verified} className="btn-primary w-full" pendingLabel="…">{t("Request access help")}</SubmitButton>
    {state.error ? <p role="alert" className="text-base text-red-700">{state.error}</p> : null}
    {state.message ? <p className="text-base text-slate-600" role="status">{t(state.message)}</p> : null}
  </form>;
}
