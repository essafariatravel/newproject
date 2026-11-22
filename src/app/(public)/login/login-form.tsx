"use client";

import { loginAction } from "@/app/actions/auth";
import type { ActionState } from "@/components/forms";
import type { UiLocale } from "@/lib/ui-i18n";
import type { TurnstilePublicConfig } from "@/lib/turnstile-config";
import { TurnstileField, useProtectedAction } from "@/components/turnstile-field";
import { PasswordField, SubmitButton } from "@/components/forms";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { loginLockoutCopy } from "@/lib/login-lockout-copy";

/**
 * Form only. The page (src/app/(public)/login/page.tsx) owns the layout
 * wrapper, the single welcome heading and the subtitle, so this component must
 * not repeat them.
 */
export interface LoginCopy {
  email: string;
  emailExample: string;
  password: string;
  signIn: string;
  signingIn: string;
  footer: string;
  forgotPassword: string;
  showPassword: string;
  hidePassword: string;
}

export function LoginForm({ copy, locale, botConfig }: { copy: LoginCopy; locale: UiLocale; botConfig: TurnstilePublicConfig }) {
  const { state, formAction, pending, verified, setVerified, challenge } = useProtectedAction<ActionState>(loginAction, {}, botConfig, locale);
  const submittedIdentifier = useRef("");
  const [currentIdentifier, setCurrentIdentifier] = useState("");
  const [remaining, setRemaining] = useState<number | null>(null);
  useEffect(() => {
    const seconds = state.retryAfterSeconds;
    if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) {
      setRemaining(null);
      return;
    }
    const endAt = Date.now() + Math.min(600, Math.ceil(seconds)) * 1000;
    const update = () => setRemaining(Math.max(0, Math.ceil((endAt - Date.now()) / 1000)));
    update();
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, [state]);

  // A temporary agency lock must never disable login for a different identity (e.g. Staff).
  const lockedResult = typeof state.retryAfterSeconds === "number" && state.retryAfterSeconds > 0 &&
    currentIdentifier.trim().toLowerCase() === submittedIdentifier.current;
  const remainingSeconds = Math.max(0, remaining ?? state.retryAfterSeconds ?? 0);
  const stillLocked = lockedResult && remainingSeconds > 0;
  const countdown = `${String(Math.floor(remainingSeconds / 60)).padStart(2, "0")}:${String(remainingSeconds % 60).padStart(2, "0")}`;
  const lockedCopy = loginLockoutCopy(locale);

  return (
    <>
      <form action={formAction} aria-busy={pending || undefined} onSubmit={event => { submittedIdentifier.current = String(new FormData(event.currentTarget).get("identifier") ?? "").trim().toLowerCase(); }} onReset={event => event.preventDefault()} className="login-form">
        {state.error ? (
          <div role="alert" className="premium-notice" data-tone="error">
            {lockedResult ? (
              <>
                <p>{lockedCopy.locked}</p>
                {stillLocked ? (
                  <p className="mt-2 font-medium">
                    {lockedCopy.remaining}{" "}
                    <span role="timer" aria-live="off" dir="ltr" className="inline-block font-semibold tabular-nums" data-testid="login-lockout-countdown">
                      {countdown}
                    </span>
                  </p>
                ) : <p className="mt-2">{lockedCopy.ready}</p>}
              </>
            ) : state.error}
          </div>
        ) : null}
        <div>
          <label htmlFor="email" className="label">{copy.email}</label>
          <input
            id="email"
            name="identifier"
            type="email"
            placeholder={copy.emailExample}
            value={currentIdentifier}
            onChange={event => setCurrentIdentifier(event.target.value)}
            autoComplete="username"
            maxLength={254}
            dir="ltr"
            required
            className="input"
          />
        </div>
        <PasswordField className="login-password" id="password" name="password" label={copy.password} autoComplete="current-password" required showRequiredMark={false} minLength={0} hint="" showLabel={copy.showPassword} hideLabel={copy.hidePassword}/>
        <div className="login-recovery"><Link href={`/forgot-password?lang=${locale}`}>{copy.forgotPassword}</Link></div>
        <div className="login-verification"><TurnstileField ref={challenge} config={botConfig} action="password_login" locale={locale} onVerified={setVerified} /></div>
        <SubmitButton disabled={!verified || stillLocked} className="premium-button" pendingLabel={copy.signingIn}>
          {copy.signIn}
        </SubmitButton>
      </form>
      <p className="login-caption">
        {copy.footer}
      </p>
    </>
  );
}
