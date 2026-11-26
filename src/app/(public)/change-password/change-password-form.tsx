"use client";

import { useState, type ReactNode } from "react";
import { profileCopy, passwordChecks } from "@/app/portal/profile/profile-copy";
import { changePasswordAction } from "@/app/actions/auth";
import { SubmitButton, type ActionState } from "@/components/forms";
import { TurnstileField, useProtectedAction } from "@/components/turnstile-field";
import type { TurnstilePublicConfig } from "@/lib/turnstile-config";
import type { UiLocale } from "@/lib/ui-i18n";

async function submit(_state: ActionState, form: FormData): Promise<ActionState> {
  await changePasswordAction(form);
  return {};
}

export function ChangePasswordForm({ children, config, locale, label, pendingLabel, agencyVoluntary = false }: {
  children: ReactNode; config: TurnstilePublicConfig; locale: UiLocale; label: string; pendingLabel: string; agencyVoluntary?: boolean;
}) {
  const { state, formAction, verified, setVerified, challenge } = useProtectedAction<ActionState>(submit, {}, config, locale);
  const c=profileCopy(locale);
  const [checks,setChecks]=useState(()=>passwordChecks("","",""));
  return (
    <form action={formAction} onReset={event => event.preventDefault()} onInput={agencyVoluntary?e=>{const d=new FormData(e.currentTarget);setChecks(passwordChecks(String(d.get("current")??""),String(d.get("password")??""),String(d.get("confirm")??"")))}:undefined} className={agencyVoluntary?"agency-password-form":"card mt-4 space-y-4 p-6"}>
      {children}
      {agencyVoluntary?<div className="agency-password-checks" aria-live="polite">{(["length","different","match"] as const).map(k=><p key={k} data-valid={checks[k]}><span aria-hidden="true">{checks[k]?"✓":"○"}</span> {c[k]}</p>)}</div>:null}
      <TurnstileField ref={challenge} config={config} action="password_change" locale={locale} onVerified={setVerified} />
      {state.error ? <p role="alert" className="text-base text-red-700">{state.error}</p> : null}
      {agencyVoluntary?<p className="agency-password-note">{c.sessions}</p>:null}
      <SubmitButton disabled={!verified} className="btn-primary w-full" pendingLabel={pendingLabel}>{label}</SubmitButton>
    </form>
  );
}
