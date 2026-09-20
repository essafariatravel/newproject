import { formatProcessingDays } from "@/lib/format";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { documentTypes, visaRequirements, visaTypes } from "@/db/schema";
import { pageUser } from "@/lib/page-auth";
import { hasPermission } from "@/lib/rbac";
import { flashFrom } from "@/lib/action-helpers";
import { addRequirementAction, removeRequirementAction, updateRequirementAction, updateVisaTypeAction } from "@/app/actions/config";
import { formatAmount } from "@/lib/format";
import { SubmitButton } from "@/components/forms";
import { Card, CardHeader, Flash, KeyValue, PageHeader, TableWrap } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function VisaTypeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const staff = await pageUser();
  if (!hasPermission(staff, "config.view")) notFound();

  const rows = await db.select().from(visaTypes).where(eq(visaTypes.id, id)).limit(1);
  const vt = rows[0];
  if (!vt) notFound();

  const [requirements, docTypes] = await Promise.all([
    db
      .select({ req: visaRequirements, docTypeName: documentTypes.name, docTypeCode: documentTypes.code })
      .from(visaRequirements)
      .innerJoin(documentTypes, eq(visaRequirements.documentTypeId, documentTypes.id))
      .where(eq(visaRequirements.visaTypeId, id))
      .orderBy(asc(visaRequirements.sortOrder)),
    db.select().from(documentTypes).where(eq(documentTypes.active, true)).orderBy(asc(documentTypes.sortOrder)),
  ]);
  const canManage = hasPermission(staff, "config.manage");
  const flash = flashFrom(sp);
  const missingDocTypes = docTypes.filter((d) => !requirements.some((r) => r.req.documentTypeId === d.id));

  return (
    <>
      <PageHeader
        title={vt.name}
        subtitle={`${vt.code} · ${vt.active ? "Active" : "Inactive"} — snapshots are taken when applications are created`}
        actions={
          <>
            {canManage ? (
              <form action={updateVisaTypeAction}>
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="back" value={`/admin/config/visa-types/${id}`} />
                <input type="hidden" name="toggle" value="1" />
                <SubmitButton className={vt.active ? "btn-danger btn-sm" : "btn-secondary btn-sm"} pendingLabel="…">
                  {vt.active ? "Deactivate" : "Activate"}
                </SubmitButton>
              </form>
            ) : null}
            <Link href="/admin/config/visa-types" className="btn-secondary btn-sm">← All visa types</Link>
          </>
        }
      />
      <Flash {...flash} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card>
            <CardHeader title="Requirements & document checklist rules" subtitle="Applied to new applications. Draft applications re-sync automatically; submitted applications are never rewritten." />
            <TableWrap>
              <thead className="border-b border-slate-100 bg-ivory-50/60">
                <tr>
                  <th className="th">Document</th>
                  <th className="th">Required</th>
                  <th className="th">Order</th>
                  <th className="th">Notes</th>
                  <th className="th">Status</th>
                  {canManage ? <th className="th text-right">Actions</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {requirements.map(({ req, docTypeName, docTypeCode }) => (
                  <tr key={req.id} className="tr-hover">
                    <td className="td">
                      <span className="font-medium text-navy-900">{docTypeName}</span>
                      <span className="block text-xs text-slate-400">{docTypeCode}</span>
                    </td>
                    <td className="td">
                      <span className={`badge ${req.required ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-500"}`}>
                        {req.required ? "Required" : "Optional"}
                      </span>
                    </td>
                    <td className="td tabular-nums text-xs">{req.sortOrder}</td>
                    <td className="td max-w-[220px] truncate text-xs text-slate-500" title={req.notes ?? ""}>{req.notes ?? "—"}</td>
                    <td className="td">
                      <span className={`badge ${req.active ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-500"}`}>
                        {req.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    {canManage ? (
                      <td className="td text-right">
                        <div className="flex justify-end gap-1.5">
                          <form action={updateRequirementAction}>
                            <input type="hidden" name="id" value={req.id} />
                            <input type="hidden" name="visaTypeId" value={id} />
                            <input type="hidden" name="toggleRequired" value="1" />
                            <SubmitButton className="btn-secondary btn-sm" pendingLabel="…">
                              Make {req.required ? "optional" : "required"}
                            </SubmitButton>
                          </form>
                          <form action={updateRequirementAction}>
                            <input type="hidden" name="id" value={req.id} />
                            <input type="hidden" name="visaTypeId" value={id} />
                            <input type="hidden" name="toggleActive" value="1" />
                            <SubmitButton className="btn-secondary btn-sm" pendingLabel="…">
                              {req.active ? "Deactivate" : "Activate"}
                            </SubmitButton>
                          </form>
                          <form action={removeRequirementAction}>
                            <input type="hidden" name="id" value={req.id} />
                            <input type="hidden" name="visaTypeId" value={id} />
                            <SubmitButton className="btn-danger btn-sm" pendingLabel="…">Remove</SubmitButton>
                          </form>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
                {requirements.length === 0 ? (
                  <tr><td colSpan={6} className="td py-8 text-center text-slate-500">No requirements yet — applications of this visa would have an empty checklist.</td></tr>
                ) : null}
              </tbody>
            </TableWrap>
          </Card>

          {canManage && missingDocTypes.length > 0 ? (
            <Card>
              <CardHeader title="Add requirement" />
              <form action={addRequirementAction} className="grid grid-cols-1 gap-4 px-4 py-4 sm:grid-cols-4">
                <input type="hidden" name="visaTypeId" value={id} />
                <div className="sm:col-span-2">
                  <label className="label" htmlFor="documentTypeId">Document type *</label>
                  <select id="documentTypeId" name="documentTypeId" required className="input">
                    {missingDocTypes.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="required">Required?</label>
                  <select id="required" name="required" className="input" defaultValue="true">
                    <option value="true">Required</option>
                    <option value="false">Optional</option>
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="sortOrder">Sort order</label>
                  <input id="sortOrder" name="sortOrder" type="number" min="0" defaultValue={10} className="input" />
                </div>
                <div className="sm:col-span-3">
                  <label className="label" htmlFor="notes">Notes (shown on the agency checklist)</label>
                  <input id="notes" name="notes" className="input" placeholder="Last 3 months, stamped." />
                </div>
                <div className="flex items-end">
                  <SubmitButton className="btn-primary" pendingLabel="Adding…">Add</SubmitButton>
                </div>
              </form>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Visa type" />
            <KeyValue
              items={[
                { label: "Code", value: vt.code },
                { label: "Fee", value: formatAmount(vt.fee, vt.currency) },
                { label: "Processing", value: formatProcessingDays(vt.processingMinDays, vt.processingMaxDays) },
                { label: "Description", value: vt.description ?? "—" },
              ]}
            />
          </Card>

          {canManage ? (
            <Card>
              <CardHeader title="Edit" subtitle="Existing applications keep their snapshot; new applications use these values." />
              <form action={updateVisaTypeAction} className="space-y-3 px-4 py-4">
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="back" value={`/admin/config/visa-types/${id}`} />
                <div>
                  <label className="label" htmlFor="e-name">Name *</label>
                  <input id="e-name" name="name" required defaultValue={vt.name} className="input" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label" htmlFor="e-fee">Fee *</label>
                    <input id="e-fee" name="fee" type="number" step="0.01" min="0" required defaultValue={vt.fee} className="input" />
                  </div>
                  <div>
                    <label className="label" htmlFor="e-currency">Currency *</label>
                    <input id="e-currency" name="currency" required maxLength={3} defaultValue={vt.currency} className="input uppercase" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label" htmlFor="e-min">Min days (0 = on request) *</label>
                    <input id="e-min" name="processingMinDays" type="number" min="0" required defaultValue={vt.processingMinDays} className="input" />
                  </div>
                  <div>
                    <label className="label" htmlFor="e-max">Max days (0 = on request) *</label>
                    <input id="e-max" name="processingMaxDays" type="number" min="0" required defaultValue={vt.processingMaxDays} className="input" />
                  </div>
                </div>
                <div>
                  <label className="label" htmlFor="e-desc">Description</label>
                  <textarea id="e-desc" name="description" rows={2} defaultValue={vt.description ?? ""} className="input" />
                </div>
                <SubmitButton className="btn-primary w-full" pendingLabel="Saving…">Save visa type</SubmitButton>
              </form>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
