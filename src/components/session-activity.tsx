"use client";

import { useEffect, useRef, useState } from "react";
import { logoutAction, touchSessionAction } from "@/app/actions/auth";
import { SESSION_WARNING_MS } from "@/lib/identity-policy";
import { sessionWarningCopy } from "@/lib/session-warning-copy";
import type { UiLocale } from "@/lib/ui-locale-values";

type Warning = { seconds: number; absolute: boolean };
type SessionStatus = {
  authenticated: true;
  idleDeadlineAt: string;
  absoluteExpiresAt: string;
  serverNow: string;
};

const STATUS_POLL_MS = 60_000;
const TOUCH_THROTTLE_MS = 60_000;

/**
 * Browser warnings are advisory; the server always enforces real expiry.
 * No background poll, countdown or tab visibility change calls touchSessionAction.
 * Cross-tab activity is honored by checking the server before redirecting.
 */
export function SessionActivity({ locale = "en" }: { agency?: boolean; locale?: UiLocale }) {
  const copy = sessionWarningCopy(locale);
  const [warning, setWarning] = useState<Warning | null>(null);
  const [continuing, setContinuing] = useState(false);
  const [continueError, setContinueError] = useState(false);
  const continueButton = useRef<HTMLButtonElement>(null);
  const refreshRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    if (warning && !continuing) continueButton.current?.focus();
  }, [Boolean(warning), warning?.absolute]); // focus only when dialog appears or its mode changes

  useEffect(() => {
    let disposed = false;
    let expired = false;
    let checking = false;
    let touching = false;
    let lastSentAt = 0;
    let deadlineAt: number | null = null;
    let absoluteAt: number | null = null;

    const expire = () => {
      if (disposed || expired) return;
      expired = true;
      window.location.replace("/login?reason=session-expired");
    };

    const renderWarning = () => {
      if (disposed || expired || deadlineAt === null) return;
      const remaining = deadlineAt - Date.now();
      if (remaining <= 0) {
        setWarning({ seconds: 0, absolute: absoluteAt !== null && absoluteAt <= deadlineAt + 1000 });
        return;
      }
      if (remaining > SESSION_WARNING_MS) {
        setWarning(null);
        return;
      }
      setWarning({
        seconds: Math.ceil(remaining / 1000),
        absolute: absoluteAt !== null && absoluteAt <= deadlineAt + 1000,
      });
    };

    const check = async (failClosedIfUnreachable = false): Promise<void> => {
      if (disposed || expired || checking) return;
      checking = true;
      try {
        const response = await fetch("/api/session", { cache: "no-store" });
        if (disposed || expired) return;
        if (response.status === 401) {
          expire();
          return;
        }
        if (!response.ok) throw new Error("Session check unavailable");
        const status = await response.json() as SessionStatus;
        const serverNow = Date.parse(status.serverNow);
        const idleEnd = Date.parse(status.idleDeadlineAt);
        const absoluteEnd = Date.parse(status.absoluteExpiresAt);
        if (status.authenticated !== true ||
          ![serverNow, idleEnd, absoluteEnd].every(Number.isFinite)) {
          throw new Error("Invalid session check");
        }
        const now = Date.now();
        deadlineAt = now + Math.min(idleEnd, absoluteEnd) - serverNow;
        absoluteAt = now + absoluteEnd - serverNow;
        if (deadlineAt <= now) { expire(); return; }
        renderWarning();
      } catch {
        // An exhausted known session is never kept open merely by a network error.
        if (failClosedIfUnreachable || (deadlineAt !== null && Date.now() >= deadlineAt)) expire();
      } finally {
        checking = false;
      }
    };

    refreshRef.current = () => { void check(); };
    const activity = (event: Event) => {
      if (!event.isTrusted || expired || disposed) return;
      // Warning buttons have explicit semantics: only "Stay signed in" renews.
      if (event.target instanceof Element && event.target.closest("[data-session-warning]")) return;
      if (touching || Date.now() - lastSentAt < TOUCH_THROTTLE_MS) return;
      touching = true;
      lastSentAt = Date.now();
      void touchSessionAction()
        .then((result) => {
          if (disposed) return;
          if (result.expired) expire();
          else void check();
        })
        .catch(() => {
          // A failed write never updates the server's last activity timestamp.
        })
        .finally(() => { touching = false; });
    };

    const onReturn = () => {
      if (document.visibilityState === "visible") {
        void check(deadlineAt !== null && Date.now() >= deadlineAt);
      }
    };

    for (const name of ["pointerdown", "keydown", "scroll"]) {
      window.addEventListener(name, activity, { passive: true });
    }
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("pageshow", onReturn);
    const poll = window.setInterval(() => { void check(); }, STATUS_POLL_MS);
    const clock = window.setInterval(() => {
      renderWarning();
      if (deadlineAt !== null && Date.now() >= deadlineAt) void check(true);
    }, 1000);
    void check();

    return () => {
      disposed = true;
      refreshRef.current = () => undefined;
      window.clearInterval(poll);
      window.clearInterval(clock);
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("pageshow", onReturn);
      for (const name of ["pointerdown", "keydown", "scroll"]) {
        window.removeEventListener(name, activity);
      }
    };
  }, []);

  const staySignedIn = async () => {
    if (continuing || warning?.absolute) return;
    setContinuing(true);
    setContinueError(false);
    try {
      const result = await touchSessionAction();
      if (result.expired) {
        window.location.replace("/login?reason=session-expired");
        return;
      }
      refreshRef.current();
    } catch {
      setContinueError(true);
    } finally {
      setContinuing(false);
    }
  };

  if (!warning) return null;
  const minutes = String(Math.floor(warning.seconds / 60)).padStart(2, "0");
  const seconds = String(warning.seconds % 60).padStart(2, "0");
  return (
    <div
      data-session-warning
      data-testid="session-expiry-warning"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-navy-950/35 px-4 py-6"
      dir={locale === "ar" ? "rtl" : "ltr"}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-warning-title"
        aria-describedby="session-warning-description"
        className="w-full max-w-md rounded-xl border border-line bg-white p-6 shadow-xl sm:p-8"
      >
        <div className="mb-5 h-1 w-12 rounded-full bg-gold-500" aria-hidden="true" />
        <h2 id="session-warning-title" className="text-xl font-semibold tracking-tight text-navy-900">
          {warning.absolute ? copy.absoluteTitle : copy.idleTitle}
        </h2>
        <p id="session-warning-description" className="mt-3 text-base leading-relaxed text-slate-600">
          {warning.absolute ? copy.absoluteBody : copy.idleBody}
        </p>
        <div className="mt-5 border-y border-line py-4">
          <p className="text-xs font-semibold text-slate-500">{copy.remaining}</p>
          <p className="mt-1 font-mono text-3xl font-semibold tabular-nums text-navy-900" dir="ltr" aria-live="off">
            {minutes}:{seconds}
          </p>
        </div>
        {continueError ? <p role="alert" className="mt-3 text-sm text-red-700">{copy.failure}</p> : null}
        <div className="mt-6 flex flex-wrap gap-3">
          {warning.absolute ? (
            <form action={logoutAction}>
              <button type="submit" className="btn-primary">{copy.signInAgain}</button>
            </form>
          ) : (
            <button
              type="button"
              ref={continueButton}
              className="btn-primary"
              disabled={continuing}
              onClick={() => { void staySignedIn(); }}
              data-testid="session-stay-signed-in"
            >
              {continuing ? copy.working : copy.stay}
            </button>
          )}
          <form action={logoutAction}>
            <button type="submit" className="btn-secondary">{copy.signOut}</button>
          </form>
        </div>
      </div>
    </div>
  );
}
