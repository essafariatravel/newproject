"use client";

import { useActionState } from "react";
import { loginAction } from "@/app/actions/auth";
import { SubmitButton } from "@/components/forms";
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
}

export function LoginForm({ copy }: { brandName: string; copy: LoginCopy }) {
  const [state, formAction] = useActionState(loginAction, {});
  return (
    <>
      <form action={formAction} className="mt-8 space-y-4">
        {state.error ? (
          <div role="alert" className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
            {state.error}
          </div>
        ) : null}
        <div>
          <label htmlFor="email" className="label">{copy.email}</label>
          <input
            id="email"
            name="identifier"
            type="text"
            autoComplete="username"
            maxLength={254}
            dir="ltr"
            required
            className="input"
          />
        </div>
        <div>
          <label htmlFor="password" className="label">{copy.password}</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="input"
            placeholder="••••••••"
          />
        </div>
        <SubmitButton className="btn-primary w-full py-2.5" pendingLabel={copy.signingIn}>
          {copy.signIn}
        </SubmitButton>
      </form>
      <Link href="/forgot-password" className="mt-4 block text-center text-sm text-iris-700 underline">{copy.forgotPassword}</Link>
      <p className="mt-6 text-center text-xs text-slate-500">
        {copy.footer}
      </p>
    </>
  );
}
