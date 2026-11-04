"use client";

import { loginAction } from "@/app/actions/auth";
import type { ActionState } from "@/components/forms";
import type { UiLocale } from "@/lib/ui-i18n";
import type { TurnstilePublicConfig } from "@/lib/turnstile-config";
import { TurnstileField, useProtectedAction } from "@/components/turnstile-field";
import { PasswordField, SubmitButton } from "@/components/forms";
import Link from "next/link";

/**
 * Form only. The page (src/app/(public)/login/page.tsx) owns the layout
 * wrapper, the single "Sign in" <h1> and the subtitle, so this component must
 * not repeat them.
 */
export interface LoginCopy {
  email: string;
  password: string;
  signIn: string;
  signingIn: string;
  footer: string;
  forgotPassword: string;
  showPassword: string;
  hidePassword: string;
}

export function LoginForm({ copy, locale, botConfig }: { brandName: string; copy: LoginCopy; locale: UiLocale; botConfig: TurnstilePublicConfig }) {
  const { state, formAction, verified, setVerified, challenge } = useProtectedAction<ActionState>(loginAction, {}, botConfig, locale);
  return (
    <>
      <form action={formAction} onReset={event => event.preventDefault()} className="mt-8 space-y-4">
        {state.error ? (
          <div role="alert" className="rounded-2xl border border-red-100 bg-red-50 px-4 py-4 text-base text-red-700">
            {state.error}
          </div>
        ) : null}
        <div>
          <label htmlFor="email" className="label">{copy.email}</label>
          <input
            id="email"
            name="identifier"
            type="email"
            autoComplete="username"
            maxLength={254}
            dir="ltr"
            required
            className="input"
          />
        </div>
        <PasswordField id="password" name="password" label={copy.password} autoComplete="current-password" required minLength={0} hint="" showLabel={copy.showPassword} hideLabel={copy.hidePassword}/>
        <TurnstileField ref={challenge} config={botConfig} action="agency_login" locale={locale} onVerified={setVerified} />
        <SubmitButton disabled={!verified} className="btn-primary w-full py-2" pendingLabel={copy.signingIn}>
          {copy.signIn}
        </SubmitButton>
      </form>
      <Link href="/forgot-password" className="mt-4 block text-center text-base text-iris-700 underline">{copy.forgotPassword}</Link>
      <p className="mt-6 text-center text-xs text-slate-500">
        {copy.footer}
      </p>
    </>
  );
}
