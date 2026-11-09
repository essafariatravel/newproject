"use client";

import { useActionState } from "react";
import { loginAction } from "@/app/actions/auth";
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

export function LoginForm({ copy }: { brandName: string; copy: LoginCopy }) {
  const [state, formAction] = useActionState(loginAction, {});
  return (
    <>
      <form action={formAction} className="login-sky-form">
        {state.error ? (
          <div role="alert" className="login-sky-error">
            {state.error}
          </div>
        ) : null}
        <div className="login-sky-field">
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
        <PasswordField id="password" name="password" label={copy.password} autoComplete="current-password" required minLength={0} hint="" className="login-sky-field" showLabel={copy.showPassword} hideLabel={copy.hidePassword}/>
        <Link href="/forgot-password" className="login-sky-forgot">{copy.forgotPassword}</Link>
        <SubmitButton className="btn-primary login-sky-submit" pendingLabel={copy.signingIn}>
          {copy.signIn}
        </SubmitButton>
      </form>
      <p className="login-sky-form-caption">
        {copy.footer}
      </p>
    </>
  );
}
