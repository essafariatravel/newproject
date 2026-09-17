import { portalPageUser } from "@/lib/page-auth";
import { activeVisaOptions } from "@/lib/queries";
import { listPriorities } from "@/lib/applications";
import { flashFrom } from "@/lib/action-helpers";
import { formatAmount } from "@/lib/format";
import { getBalance } from "@/lib/wallet";
import { createApplicationAction } from "@/app/actions/applications";
import { SubmitButton } from "@/components/forms";
import { Card, CardHeader, Flash, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function NewApplicationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const user = await portalPageUser();
  const flash = flashFrom(sp);

  const [visaOptions, priorities, wallet] = await Promise.all([
    activeVisaOptions(),
    listPriorities(true),
    getBalance(user.agencyId),
  ]);

  return (
    <>
      <PageHeader
        title="New application"
        subtitle="Step 1 — choose the visa. Applicants, documents, review and submission follow on the application page."
      />
      <Flash {...flash} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <form action={createApplicationAction} className="card p-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label" htmlFor="visaTypeId">Visa programme *</label>
                <select id="visaTypeId" name="visaTypeId" required className="input" defaultValue="">
                  <option value="" disabled>
                    Select country and visa…
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
                <label className="label" htmlFor="priorityCode">Priority</label>
                <select id="priorityCode" name="priorityCode" className="input" defaultValue="STANDARD">
                  {priorities.map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="agencyNotes">Notes for ESSAFARIA (optional)</label>
                <textarea id="agencyNotes" name="agencyNotes" rows={3} className="input" placeholder="Travel dates, group context, special requests…" />
              </div>
            </div>
            <div className="mt-5">
              <SubmitButton className="btn-primary" pendingLabel="Creating draft…">
                Create draft application
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
