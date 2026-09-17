"use client";

import { useActionState } from "react";
import { loginAction } from "@/app/actions/auth";
import { SubmitButton } from "@/components/forms";
import BrandMark from "@/components/brand-mark";

export default function LoginPage() {
  const [state, formAction] = useActionState(loginAction, {});
  return (
    <div className="grid min-h-[calc(100vh-4rem)] grid-cols-1 lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-navy-950 p-12 lg:flex">
        <BrandMark className="h-10 w-10" />
        <div>
          <h2 className="font-serif text-3xl leading-snug text-white">
            One platform for your entire
            <span className="text-gold-400"> visa operation</span>
          </h2>
          <p className="mt-4 max-w-md text-slate-400">
            Agency partners manage applications, documents and wallets. ESSAFARIA staff process files from
            the central Back Office.
          </p>
        </div>
        <p className="text-xs text-slate-500">
          Access is restricted to authorized users. All activity is logged and audited.
        </p>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex justify-center lg:hidden">
            <BrandMark className="h-12 w-12" />
          </div>
          <h1 className="font-serif text-2xl text-navy-900">Sign in</h1>
          <p className="mt-1 text-sm text-slate-500">Agency portal and Back Office access.</p>
          <form action={formAction} className="mt-8 space-y-4">
            {state.error ? (
              <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
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
            Agency access is provisioned by ESSAFARIA. Forgotten credentials? Contact your account manager.
          </p>
        </div>
      </div>
    </div>
  );
}
