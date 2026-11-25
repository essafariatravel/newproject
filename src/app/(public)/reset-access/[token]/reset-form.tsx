"use client";

import { resetAccessAction, type RecoveryState } from "@/app/actions/recovery";
import { TurnstileField, useProtectedAction } from "@/components/turnstile-field";
import type { TurnstilePublicConfig } from "@/lib/turnstile-config";
import { PasswordField, SubmitButton } from "@/components/forms";
import { identityT } from "@/lib/identity-copy";
import { contentT } from "@/lib/i18n-content";
import type { UiLocale } from "@/lib/ui-i18n";

export function ResetAccessForm({ token, locale, botConfig }: { token: string; locale: UiLocale; botConfig: TurnstilePublicConfig }) {
  const { state, formAction, pending, verified, setVerified, challenge } = useProtectedAction<RecoveryState>(resetAccessAction, {}, botConfig, locale);
  const t = identityT(locale), ct = contentT(locale);
  return <form action={formAction} onReset={event => event.preventDefault()} aria-busy={pending} className="access-form">
    <input type="hidden" name="token" value={token} />
    <PasswordField id="reset-password" name="password" label={ct("New password")} required minLength={12} autoComplete="new-password" hint={t('Use at least 12 characters, preferably a unique passphrase.')} showLabel={ct("Show")} hideLabel={ct("Hide")} />
    <PasswordField id="reset-confirm" name="confirm" label={ct("Confirm the new password")} required autoComplete="new-password" hint={ct("Type the same password again.")} showLabel={ct("Show")} hideLabel={ct("Hide")} />
    {state.error ? <p className="access-error" role="alert">{t(state.error)}</p> : null}
    <TurnstileField ref={challenge} config={botConfig} action="access_reset" locale={locale} onVerified={setVerified} />
    <SubmitButton disabled={!verified} className="access-submit" pendingLabel={ct("Saving…")}>{t("Save password")}</SubmitButton>
  </form>;
}
