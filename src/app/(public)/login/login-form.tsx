"use client";

import { useActionState } from "react";
import { loginAction } from "@/app/actions/auth";
import { SubmitButton } from "@/components/forms";

/**
 * Form only. The page (src/app/(public)/login/page.tsx) owns the layout
 * wrapper, the single "Sign in" <h1> and the subtitle, so this component must
 * not repeat them.
 */
export function LoginForm({ brandName }: { brandName: string }) {
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
          <label htmlFor="email" className="label">Email address</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="input"
            placeholder="you@agency.example"
          />
        </div>
        <div>
          <label htmlFor="password" className="label">Password</label>
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
        <SubmitButton className="btn-primary w-full py-2.5" pendingLabel="Signing in…">
          Sign in
        </SubmitButton>
      </form>
      <p className="mt-6 text-center text-xs text-slate-500">
        Agency access is provisioned by {brandName}. Forgotten credentials? Contact your account manager.
      </p>
    </>
  );
}
