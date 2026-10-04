"use client";

import { useActionState, useState } from "react";
import { generateAccessLinkAction } from "@/app/actions/recovery";
import { SubmitButton } from "@/components/forms";
import { identityT } from "@/lib/identity-copy";
import type { UiLocale } from "@/lib/ui-i18n";

export function AccessLinkForm({ userId, requestId, locale = "en", purpose = "PASSWORD_RESET" }: {
  userId: string; requestId?: string; locale?: UiLocale; purpose?: "ACTIVATION" | "PASSWORD_RESET";
}) {
  const [state, action] = useActionState(generateAccessLinkAction, {});
  const [visible, setVisible] = useState(true);
  const [copied, setCopied] = useState(false);
  const t = identityT(locale);
  return <div className="max-w-sm text-start">
    <form action={action} onSubmit={() => { setVisible(true); setCopied(false); }}>
      <input type="hidden" name="userId" value={userId} />
      {requestId ? <input type="hidden" name="requestId" value={requestId} /> : null}
      <input type="hidden" name="purpose" value={purpose} />
      <SubmitButton className="btn-secondary btn-sm" pendingLabel="…">{t(purpose === "ACTIVATION" ? "Generate activation link" : requestId ? "Generate access link" : "Reset access")}</SubmitButton>
    </form>
    {state.error ? <p className="mt-2 text-xs text-red-700" role="alert">{t(state.error)}</p> : null}
    {visible && state.link ? <div className="mt-2 space-y-2 border border-slate-200 bg-white p-4" role="status">
      <p className="text-xs text-slate-600">{t(state.message ?? "")}</p>
      <code className="block break-all text-xs" dir="ltr">{state.link}</code>
      <p className="text-xs text-slate-500">{t("Expires")}: {new Date(state.expiresAt!).toLocaleString(locale)}</p>
      <div className="flex gap-4">
        <button type="button" className="min-h-11 text-base font-medium text-iris-700 underline" onClick={async () => {
          try { await navigator.clipboard.writeText(new URL(state.link!, window.location.origin).href); setCopied(true); }
          catch { setCopied(false); }
        }}>{t(copied ? "Copied" : "Copy link")}</button>
        <button type="button" className="min-h-11 text-base text-slate-600 underline" onClick={() => setVisible(false)}>{t("Hide link")}</button>
      </div>
    </div> : null}
  </div>;
}
