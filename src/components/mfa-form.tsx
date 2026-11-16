"use client";
import { useState } from "react";
import { enrollMfaAction, confirmMfaAction } from "@/app/actions/mfa";
import { mfaCopy } from "@/lib/security-copy";
import type { UiLocale } from "@/lib/ui-i18n";

export function MfaForm({enrolled,locale}:{enrolled:boolean;locale:UiLocale}) {
  const copy=mfaCopy(locale);
  const [secret,setSecret]=useState("");
  const [uri,setUri]=useState("");
  const [codes,setCodes]=useState<string[] | null>(null);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  return <div className="space-y-4">
    <p>{copy.intro}</p>
    {error && <p role="alert">{error}</p>}
    {!enrolled && !secret && <form className="space-y-3" onSubmit={async e=>{e.preventDefault();setBusy(true);setError("");try{const data=new FormData(e.currentTarget);const result=await enrollMfaAction(String(data.get("password")),String(data.get("authorization")));if(result.enrollment){setSecret(result.enrollment.secret);setUri(result.enrollment.uri);}else setError(copy.error);}catch{setError(copy.error);}finally{setBusy(false);}}}>
      <label htmlFor="mfa-password">{copy.password}</label>
      <input id="mfa-password" name="password" type="password" autoComplete="current-password" maxLength={200} required className="input block w-full" />
      <label htmlFor="mfa-authorization">{copy.authorization}</label><input id="mfa-authorization" name="authorization" autoComplete="off" maxLength={32} required className="input block w-full" /><p>{copy.approval}</p>
      <button disabled={busy} className="btn btn-primary">{copy.setup}</button>
    </form>}
    {secret && !codes && <div><p>{copy.key}</p><code dir="ltr" className="break-all">{secret}</code><p><a href={uri}>{copy.open}</a></p><p>{copy.expires}</p></div>}
    {(enrolled || secret) && !codes && <form className="space-y-3" onSubmit={async e=>{e.preventDefault();setBusy(true);setError("");try{const data=new FormData(e.currentTarget);const result=await confirmMfaAction(String(data.get("code")),!enrolled);if(result.error)setError(copy.error);else if(result.recoveryCodes?.length){setCodes(result.recoveryCodes);setSecret("");setUri("");}else window.location.assign("/admin");}catch{setError(copy.error);}finally{setBusy(false);}}}>
      <label htmlFor="mfa-code">{enrolled?copy.recoveryCode:copy.code}</label>
      <input id="mfa-code" name="code" autoComplete="one-time-code" maxLength={32} required className="input block w-full" />
      <button disabled={busy} className="btn btn-primary">{copy.verify}</button>
    </form>}
    {codes && <div><p>{copy.save}</p><ul>{codes.map(code=><li key={code}><code dir="ltr">{code}</code></li>)}</ul><a className="btn btn-primary" href="/admin">{copy.continue}</a></div>}
  </div>;
}
