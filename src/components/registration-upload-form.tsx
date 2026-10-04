"use client";
import { useState } from "react";
import { registrationReviewCopy, type RegistrationLocale } from "@/lib/i18n";
import { contentT } from "@/lib/i18n-content";
import { registrationUploadProblem } from "@/lib/request-feedback";
export function RegistrationUploadForm({token,locale,slots}: {token:string;locale:RegistrationLocale;slots:Array<{id:string;label:string}>}) {
  const copy = registrationReviewCopy(locale);
  const ct=contentT(locale);
  const [received,setReceived] = useState<string[]>([]);
  const [pending,setPending] = useState<string|null>(null);
  const [error,setError] = useState("");
  async function upload(event:React.FormEvent<HTMLFormElement>,id:string) {
    event.preventDefault(); setError("");setPending(id);
    const body = new FormData(event.currentTarget);
    const file=body.get("file");
    if (!(file instanceof File) || registrationUploadProblem(file)) {setError(ct("Choose a PDF, JPEG, PNG or WebP file up to 2 MB."));setPending(null);return;}
    body.set("slotId",id);
    try { const result = await fetch(`/api/registration-followup/${token}`,{method:"POST",body,referrerPolicy:"no-referrer"}); if(!result.ok) {setError(ct(result.status === 404 ? "This upload link is unavailable. Contact ESSAFARIA for a new link." : result.status === 413 ? "Choose a PDF, JPEG, PNG or WebP file up to 2 MB." : "The file could not be accepted. Check its format and size, then try again."));return;} setReceived((previous)=>[...previous,id]); }
    catch {setError(ct("The upload was interrupted. Check your connection and select the file again."));} finally {setPending(null);}
  }
  return <div className="space-y-5">{error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}{received.length === slots.length ? <p role="status" className="border-t border-line pt-5 text-sm text-emerald-700">{copy.received}</p> : slots.filter((slot)=>!received.includes(slot.id)).map((slot)=><form key={slot.id} onSubmit={(event)=>void upload(event,slot.id)} className="space-y-3 border-t border-line pt-5"><label htmlFor={`file-${slot.id}`} className="label">{slot.label}</label><input id={`file-${slot.id}`} name="file" type="file" required accept="application/pdf,image/jpeg,image/png,image/webp" className="w-full max-w-full text-sm"/><button type="submit" disabled={pending!==null} className="btn-primary">{pending === slot.id ? copy.uploading : copy.upload}</button></form>)}</div>;
}
