import { portalPageUser } from "@/lib/page-auth";
import { activeVisaOptions } from "@/lib/queries";
import { listPriorities } from "@/lib/applications";
import { flashFrom } from "@/lib/action-helpers";
import { formatAmount } from "@/lib/format";
import { getBalance } from "@/lib/wallet";
import { createApplicationAction } from "@/app/actions/applications";
import { SubmitButton } from "@/components/forms";
import { Card, CardHeader, Flash, PageHeader } from "@/components/ui";
import { getUiLocale } from "@/lib/ui-i18n";
import { WizardSteps } from "@/components/wizard-steps";
import { contentT } from "@/lib/i18n-content";

export const dynamic = "force-dynamic";

export default async function NewApplicationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const user = await portalPageUser();
  const ct = contentT(await getUiLocale());
  const flash = flashFrom(sp);

  const [visaOptions, priorities, wallet] = await Promise.all([
    activeVisaOptions(),
    listPriorities(true),
    getBalance(user.agencyId),
  ]);

  return (
    <>
      <PageHeader
        title={ct("New application")}
        subtitle={ct("Four steps: choose the visa, add applicants, upload the required documents, review and submit.")}
      />
      <Flash {...flash} />

      <WizardSteps
        current={1}
        steps={[
          { id: 1, label: ct("Choose visa") },
          { id: 2, label: ct("Applicant info") },
          { id: 3, label: ct("Upload documents") },
          { id: 4, label: ct("Review & submit") },
        ]}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <form action={createApplicationAction} className="card p-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label" htmlFor="visaTypeId">{ct("Visa programme *")}</label>
                <select id="visaTypeId" name="visaTypeId" required className="input" defaultValue="">
                  <option value="" disabled>
                    {ct("Select country and visa…")}
                  </option>
                  {visaOptions.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label} — {formatAmount(v.fee, v.currency)} · {v.minDays}–{v.maxDays} days
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-xs text-slate-500">
                  The fee and processing time are locked to this application when it is created; later
                  catalogue changes do not affect it.
                </p>
              </div>
              <div>
                <label className="label" htmlFor="priorityCode">{ct("Priority")}</label>
                <select id="priorityCode" name="priorityCode" className="input" defaultValue="STANDARD">
                  {priorities.map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="agencyNotes">{ct("Notes for ESSAFARIA (optional)")}</label>
                <textarea id="agencyNotes" name="agencyNotes" rows={3} className="input" placeholder={ct("Travel dates, group context, special requests…")} />
              </div>
            </div>
            <div className="mt-5">
              <SubmitButton className="btn-primary" pendingLabel={ct("Creating draft…")}>
                {ct("Continue to applicant info")}
              </SubmitButton>
            </div>
          </form>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="How submission works" />
            <ol className="list-decimal space-y-2 px-6 py-4 text-sm text-slate-600">
              <li>Create the draft — the checklist is generated automatically.</li>
              <li>Add every traveller's details.</li>
              <li>Upload the required documents.</li>
              <li>Review the summary and submit.</li>
              <li>
                Your wallet is charged <strong>once</strong>, automatically, with a full ledger entry.
              </li>
            </ol>
          </Card>
          <Card>
            <CardHeader title="Your wallet" />
            <div className="px-4 py-4">
              <p className="font-serif text-2xl text-navy-900 tabular-nums">
                {formatAmount(wallet.balance, wallet.currency)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Applications cannot be submitted if the balance is insufficient. Contact ESSAFARIA
                accounting to top up.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
