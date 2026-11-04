"use client";

import { forwardRef, useActionState, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { botProtectionCopy } from "@/lib/bot-protection-copy";
import type { TurnstileAction, TurnstilePublicConfig } from "@/lib/turnstile-config";
import type { UiLocale } from "@/lib/ui-i18n";

type WidgetApi = {
  render(element: HTMLElement, options: Record<string, unknown>): string;
  reset(id: string): void;
  remove(id: string): void;
};
declare global { interface Window { turnstile?: WidgetApi } }
let loading: Promise<WidgetApi> | undefined;

function loadWidget(): Promise<WidgetApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (loading) return loading;
  loading = new Promise<WidgetApi>((resolve, reject) => {
    const script = document.createElement("script");
    const fail = () => { clearTimeout(timer); script.remove(); loading = undefined; reject(new Error("Security verification unavailable")); };
    const timer = window.setTimeout(fail, 15_000);
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = () => {
      clearTimeout(timer);
      if (window.turnstile) resolve(window.turnstile);
      else fail();
    };
    script.onerror = fail;
    document.head.appendChild(script);
  });
  return loading;
}

export interface TurnstileHandle { reset(): void }

/** Every same-page action completion, including a network failure, needs a fresh token. */
export function useProtectedAction<S extends { error?: string }>(
  action: (previous: Awaited<S>, form: FormData) => Promise<Awaited<S>>, initial: Awaited<S>,
  config: TurnstilePublicConfig, locale: UiLocale,
) {
  const challenge = useRef<TurnstileHandle>(null);
  const [verified, setVerified] = useState(!config.enabled);
  const guardedAction = useCallback(async (previous: Awaited<S>, form: FormData): Promise<Awaited<S>> => {
    try { return await action(previous, form); }
    catch (error) {
      // Keep Next's navigation control flow intact.
      if (error && typeof error === "object" && "digest" in error && String(error.digest).startsWith("NEXT_REDIRECT")) throw error;
      return { ...initial, error: botProtectionCopy(locale).unavailable };
    } finally { challenge.current?.reset(); }
  }, [action, initial, locale]);
  const [state, formAction, pending] = useActionState<S, FormData>(guardedAction, initial);
  return { state, formAction, pending, verified, setVerified, challenge };
}

export const TurnstileField = forwardRef<TurnstileHandle, {
  config: TurnstilePublicConfig; action: TurnstileAction; locale: UiLocale; onVerified: (ready: boolean) => void;
}>(function TurnstileField({ config, action, locale, onVerified }, ref) {
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const api = useRef<WidgetApi | null>(null);
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<"checking" | "ready" | "failed" | "expired">("checking");
  const [attempt, setAttempt] = useState(0);
  const text = botProtectionCopy(locale);
  const reset = useCallback(() => {
    if (!config.enabled) return;
    setToken(""); onVerified(false); setStatus("checking");
    if (api.current && widget.current !== null) {
      try { api.current.reset(widget.current); }
      catch { setStatus("failed"); }
    } else setAttempt(value => value + 1);
  }, [config.enabled, onVerified]);
  useImperativeHandle(ref, () => ({ reset }), [reset]);

  useEffect(() => {
    if (!config.enabled) { onVerified(true); return; }
    let active = true;
    const fail = (state: "failed" | "expired" = "failed") => {
      if (!active) return;
      setToken(""); onVerified(false); setStatus(state);
    };
    if (!config.siteKey) { fail(); return; }
    loadWidget().then(loaded => {
      if (!active || !container.current) return;
      api.current = loaded;
      widget.current = loaded.render(container.current, {
        sitekey: config.siteKey, action, appearance: "interaction-only", theme: "light", language: locale,
        size: container.current.clientWidth < 300 ? "compact" : "flexible", "response-field": false,
        "refresh-expired": "auto", "refresh-timeout": "auto", retry: "auto",
        callback: (value: string) => { if (active) { setToken(value); onVerified(true); setStatus("ready"); } },
        "error-callback": () => { fail(); return true; }, "expired-callback": () => fail("expired"),
        "timeout-callback": () => fail(), "unsupported-callback": () => fail(),
      });
    }).catch(() => fail());
    return () => {
      active = false;
      if (api.current && widget.current !== null) api.current.remove(widget.current);
      widget.current = null;
    };
  }, [config.enabled, config.siteKey, action, locale, onVerified, attempt]);

  if (!config.enabled) return null;
  return <div className="space-y-2" aria-label={text.label}>
    <input type="hidden" name="cf-turnstile-response" value={token} />
    <div ref={container} />
    <p role="status" aria-live="polite" aria-atomic="true" className="text-sm text-slate-600">
      {status === "ready" ? "" : status === "checking" ? text.checking : status === "expired" ? text.expired : text.failed}
    </p>
    {status === "failed" || status === "expired" ? <button type="button" onClick={reset} className="min-h-11 text-sm font-semibold text-navy-900 underline">{text.retry}</button> : null}
    <noscript><p className="text-sm text-red-700">{text.noScript}</p></noscript>
  </div>;
});
