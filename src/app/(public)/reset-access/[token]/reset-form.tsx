"use client";

import { useActionState } from "react";
import { resetAccessAction } from "@/app/actions/recovery";
import { PasswordField, SubmitButton } from "@/components/forms";
import { identityT } from "@/lib/identity-copy";
import { contentT } from "@/lib/i18n-content";
import type { UiLocale } from "@/lib/ui-i18n";

export function ResetAccessForm({ token, locale }: { token: string; locale: UiLocale }) {
  const [state, action] = useActionState(resetAccessAction, {});
  const t = identityT(locale), ct = contentT(locale);
  return <form action={action} className="card mt-6 space-y-4 p-6">
    <input type="hidden" name="token" value={token} />
    <PasswordField id="reset-password" name="password" label={ct("New password")} required autoComplete="new-password" hint={t("Use at least 10 characters with letters and digits.")} showLabel={ct("Show")} hideLabel={ct("Hide")} />
    <PasswordField id="reset-confirm" name="confirm" label={ct("Confirm the new password")} required autoComplete="new-password" showLabel={ct("Show")} hideLabel={ct("Hide")} />
    {state.error ? <p className="text-sm text-red-700" role="alert">{t(state.error)}</p> : null}
    <SubmitButton className="btn-primary w-full" pendingLabel="…">{t("Save password")}</SubmitButton>
  </form>;
}
