"use client";

import { useActionState } from "react";
import { closeAgencyAction } from "@/app/actions/agency-closure";
import type { ClosurePreview } from "@/lib/agency-closure";
import { agencyClosureCopy, type ClosureCopyKey } from "@/lib/agency-closure-copy";
import type { UiLocale } from "@/lib/ui-i18n";
import { PasswordField } from '@/components/forms';

export function AgencyClosureForm({ summary, locale, executionAllowed }: { summary: ClosurePreview; locale: UiLocale; executionAllowed: boolean }) {
  const t = agencyClosureCopy(locale);
  const [state, action, pending] = useActionState(closeAgencyAction, {});
  if (summary.status === "CLOSED" || state.closed) return <p role="status" className="border-t border-line py-6 text-base text-navy-900">{t("closed")}</p>;
  return <details className="mt-8 border-t border-red-200 py-6">
    <summary className="min-h-11 cursor-pointer text-base font-semibold text-red-800">{t("title")}</summary>
    <div className="mt-4 space-y-5">
      <p className="max-w-prose text-base text-slate-700">{t("consequence")}</p>
      <dl className="grid grid-cols-2 gap-4 text-base sm:grid-cols-4">
        {([["users", summary.userCount], ["open", summary.openApplications], ["completed", summary.completedApplications], ["wallet", `${summary.balance} DZD`]] as const).map(([key, value]) => <div key={key}><dt className="text-sm text-slate-600">{t(key)}</dt><dd className="mt-1 font-semibold tabular-nums text-navy-900">{value}</dd></div>)}
      </dl>
      {summary.blockers.length ? <ul role="status" className="list-disc space-y-2 ps-5 text-base text-red-800">{summary.blockers.map(reason => <li key={reason}>{t(reason as ClosureCopyKey)}</li>)}</ul> : null}
      {summary.obligations.length ? <div className="space-y-2 text-base text-slate-700"><p>{t('obligationsHint')}</p><ul className="list-disc ps-5">{summary.obligations.map(reason=><li key={reason}>{t(reason as ClosureCopyKey)}</li>)}</ul></div>:null}
      {!executionAllowed ? <p role="status" className="text-base text-slate-700">{t("blockedTarget")}</p> : null}
      <form action={action}>
        <input type="hidden" name="agencyId" value={summary.id} />
        <fieldset disabled={pending || !executionAllowed || summary.blockers.length > 0} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><label htmlFor="closure-name" className="label">{t("confirmation")} : {summary.legalName}</label><input className="input" id="closure-name" name="confirmationName" required maxLength={512} autoComplete="off" /></div>
          <div><label htmlFor="closure-policy" className="label">{t("policy")}</label><input className="input" id="closure-policy" name="retentionReference" required maxLength={300} /></div>
          <div><label htmlFor="closure-until" className="label">{t("until")}</label><input className="input" id="closure-until" name="retainUntil" type="date" required /></div>
          <p className="text-sm text-slate-600 sm:col-span-2">{t("policyHint")}</p>
          {summary.obligations.length?<><label className="flex items-start gap-3 text-base sm:col-span-2"><input className="mt-1" name="acceptObligations" value="1" type="checkbox" required/>{t('acceptObligations')}</label><div className="sm:col-span-2"><label className="label" htmlFor="closure-responsibility">{t('responsibilityNote')}</label><textarea id="closure-responsibility" name="responsibilityNote" required maxLength={2000} rows={3} className="input"/></div></>:null}
          <div className="sm:col-span-2"><PasswordField id="closure-password" name="currentPassword" label={t('password')} required minLength={1} autoComplete="current-password" showLabel={t('showPassword')} hideLabel={t('hidePassword')}/></div>
          <button type="submit" className="btn-danger sm:col-span-2">{pending ? t("pending") : t("title")}</button>
        </fieldset>
        {state.error ? <p role="alert" className="mt-4 text-base text-red-800">{state.error}</p> : null}
      </form>
    </div>
  </details>;
}
