"use client";

import type { ReactNode } from "react";
import { changePasswordAction } from "@/app/actions/auth";
import { SubmitButton, type ActionState } from "@/components/forms";
import { TurnstileField, useProtectedAction } from "@/components/turnstile-field";
import type { TurnstilePublicConfig } from "@/lib/turnstile-config";
import type { UiLocale } from "@/lib/ui-i18n";

async function submit(_state: ActionState, form: FormData): Promise<ActionState> {
  await changePasswordAction(form);
  return {};
}

export function ChangePasswordForm({ children, config, locale, label, pendingLabel }: {
  children: ReactNode; config: TurnstilePublicConfig; locale: UiLocale; label: string; pendingLabel: string;
}) {
  const { state, formAction, verified, setVerified, challenge } = useProtectedAction<ActionState>(submit, {}, config, locale);
  return (
    <form action={formAction} onReset={event => event.preventDefault()} className="card mt-4 space-y-4 p-6">
      {children}
      <TurnstileField ref={challenge} config={config} action="password_change" locale={locale} onVerified={setVerified} />
      {state.error ? <p role="alert" className="text-base text-red-700">{state.error}</p> : null}
      <SubmitButton disabled={!verified} className="btn-primary w-full" pendingLabel={pendingLabel}>{label}</SubmitButton>
    </form>
  );
}
