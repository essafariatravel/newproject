"use client";

import { useActionState } from "react";
import { requestRecoveryAction } from "@/app/actions/recovery";
import { SubmitButton } from "@/components/forms";
import { identityT } from "@/lib/identity-copy";
import type { UiLocale } from "@/lib/ui-i18n";

export function RecoveryForm({ locale }: { locale: UiLocale }) {
  const [state, action] = useActionState(requestRecoveryAction, {});
  const t = identityT(locale);
  return <form action={action} className="card mt-6 space-y-4 p-6">
    <label className="label" htmlFor="recovery-identifier">{t("Username or staff email")}</label>
    <input id="recovery-identifier" name="identifier" className="input" type="text" required maxLength={254} autoComplete="username" dir="ltr" />
    <SubmitButton className="btn-primary w-full" pendingLabel="…">{t("Request access help")}</SubmitButton>
    {state.message ? <p className="text-base text-slate-600" role="status">{t(state.message)}</p> : null}
  </form>;
}
