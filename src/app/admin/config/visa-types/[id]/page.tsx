import { ConfigTranslations } from "@/components/config-translations";
import { configDescription, configName } from "@/lib/config-localization";
import { countryName } from "@/lib/country-names";
import { listCountries, listVisaCategories } from "@/lib/applications-exports";
import { formatProcessingDays } from "@/lib/format";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { documentTypes, visaRequirements, visaTypes } from "@/db/schema";
import { pageUser } from "@/lib/page-auth";
import { getUiLocale } from "@/lib/ui-i18n";
import { contentT } from "@/lib/i18n-content";
import { hasPermission } from "@/lib/rbac";
import { flashFrom } from "@/lib/action-helpers";
import { addRequirementAction, deleteVisaTypeAction, removeRequirementAction, updateRequirementAction, updateVisaTypeAction } from "@/app/actions/config";
import { formatAmount } from "@/lib/format";
import { ConfirmButton, SubmitButton } from "@/components/forms";
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
  const locale = await getUiLocale();
  const ct = contentT(locale);
  if (!hasPermission(staff, "config.view")) notFound();

  const rows = await db.select().from(visaTypes).where(eq(visaTypes.id, id)).limit(1);
  const vt = rows[0];
  if (!vt) notFound();

  const [requirements, docTypes, countries, categories] = await Promise.all([
    db
      .select({ req: visaRequirements, docType: documentTypes })
      .from(visaRequirements)
      .innerJoin(documentTypes, eq(visaRequirements.documentTypeId, documentTypes.id))
      .where(eq(visaRequirements.visaTypeId, id))
      .orderBy(asc(visaRequirements.sortOrder)),
    db.select().from(documentTypes).where(eq(documentTypes.active, true)).orderBy(asc(documentTypes.sortOrder)),
    listCountries(),
    listVisaCategories(),
  ]);
  const canManage = hasPermission(staff, "config.manage");
  const flash = flashFrom(sp);
  const missingDocTypes = docTypes.filter((d) => !requirements.some((r) => r.req.documentTypeId === d.id));

  return (
    <>
      <PageHeader
        title={configName(vt, locale)}
        subtitle={`${vt.code} · ${ct(vt.active ? "Active" : "Inactive")} — ${ct("Existing applications keep their snapshot; new applications use these values.")}`}
        actions={
          <>
            {canManage ? (
              <form action={updateVisaTypeAction}>
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="back" value={`/admin/config/visa-types/${id}`} />
                <input type="hidden" name="toggle" value="1" />
                <SubmitButton className={vt.active ? "btn-danger btn-sm" : "btn-secondary btn-sm"} pendingLabel="…">
                  {ct(vt.active ? "Deactivate" : "Activate")}
                </SubmitButton>
              </form>
            ) : null}
            <Link href="/admin/config/visa-types" className="btn-secondary btn-sm">{ct("← All visa types")}</Link>
          </>
        }
      />
      <Flash {...flash} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card>
            <CardHeader
              title={ct("Document requirements")}
              subtitle={ct("Applied to new applications. Draft applications re-sync automatically; submitted applications are never rewritten.")}
              testId="vt-section-docs"
            />
            <TableWrap>
              <thead className="border-b border-slate-100 bg-ivory-50/60">
                <tr>
                  <th className="th">{ct("Document")}</th>
                  <th className="th">{ct("Required")}</th>
                  <th className="th">{ct("Order")}</th>
                  <th className="th">{ct("Notes")}</th>
                  <th className="th">{ct("Status")}</th>
                  {canManage ? <th className="th text-right">{ct("Actions")}</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {requirements.map(({ req, docType }) => (
                  <tr key={req.id} className="tr-hover">
                    <td className="td">
                      <span className="font-semibold text-navy-900">{configName(docType, locale)}</span>
                      <span className="block text-xs text-slate-400">{docType.code}</span>
                    </td>
                    <td className="td">
                      <span className={`badge ${req.required ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-500"}`}>
                        {ct(req.required ? "Required" : "Optional")}
                      </span>
                    </td>
                    <td className="td tabular-nums text-xs">{req.sortOrder}</td>
                    <td className="td max-w-[220px] truncate text-xs text-slate-500" title={req.notes ?? ""}>{req.notes ?? "—"}</td>
                    <td className="td">
                      <span className={`badge ${req.active ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-500"}`}>
                        {ct(req.active ? "Active" : "Inactive")}
                      </span>
                    </td>
                    {canManage ? (
                      <td className="td text-right">
                        <div className="flex justify-end gap-2">
                          <form action={updateRequirementAction}>
                            <input type="hidden" name="id" value={req.id} />
                            <input type="hidden" name="visaTypeId" value={id} />
                            <input type="hidden" name="toggleRequired" value="1" />
                            <SubmitButton className="btn-secondary btn-sm" pendingLabel="…">
                              {ct(req.required ? "Make optional" : "Make required")}
                            </SubmitButton>
                          </form>
                          <form action={updateRequirementAction}>
                            <input type="hidden" name="id" value={req.id} />
                            <input type="hidden" name="visaTypeId" value={id} />
                            <input type="hidden" name="toggleActive" value="1" />
                            <SubmitButton className="btn-secondary btn-sm" pendingLabel="…">
                              {ct(req.active ? "Deactivate" : "Activate")}
                            </SubmitButton>
                          </form>
                          <form action={removeRequirementAction}>
                            <input type="hidden" name="id" value={req.id} />
                            <input type="hidden" name="visaTypeId" value={id} />
                            <SubmitButton className="btn-danger btn-sm" pendingLabel="…">{ct("Remove")}</SubmitButton>
                          </form>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
                {requirements.length === 0 ? (
                  <tr><td colSpan={6} className="td py-8 text-center text-slate-500">{ct("No requirements yet — applications of this visa would have an empty checklist.")}</td></tr>
                ) : null}
              </tbody>
            </TableWrap>
          </Card>

          {canManage && missingDocTypes.length > 0 ? (
            <Card>
              <CardHeader title={ct("Document requirements — add")} subtitle={ct("A document already on this list cannot be added twice; change its row instead.")} />
              <form action={addRequirementAction} className="grid grid-cols-1 gap-4 px-4 py-4 sm:grid-cols-4">
                <input type="hidden" name="visaTypeId" value={id} />
                <div className="sm:col-span-2">
                  <label className="label" htmlFor="documentTypeId">{ct("Document type *")}</label>
                  <select id="documentTypeId" name="documentTypeId" required className="input">
                    {missingDocTypes.map((d) => (
                      <option key={d.id} value={d.id}>{configName(d, locale)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="required">{ct("Required?")}</label>
                  <select id="required" name="required" className="input" defaultValue="true">
                    <option value="true">{ct("Required")}</option>
                    <option value="false">{ct("Optional")}</option>
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="sortOrder">{ct("Sort order")}</label>
                  <input id="sortOrder" name="sortOrder" type="number" min="0" defaultValue={10} className="input" />
                </div>
                <div className="sm:col-span-3">
                  <label className="label" htmlFor="notes">{ct("Notes (shown on the agency checklist)")}</label>
                  <input id="notes" name="notes" className="input" placeholder={ct("Last 3 months, stamped.")} />
                </div>
                <div className="flex items-end">
                  <SubmitButton className="btn-primary" pendingLabel={ct("Adding…")}>{ct("Add")}</SubmitButton>
                </div>
              </form>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader
              title={ct("Publication")}
              subtitle={ct("Inactive programmes disappear from the agency wizard and cannot be chosen for new applications. Existing dossiers are untouched.")}
              testId="vt-section-publication"
            />
            <div className="space-y-4 px-4 py-4">
              <span className={`badge ${vt.active ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"}`}>
                {ct(vt.active ? "Published to agencies" : "Not published")}
              </span>
              <p className="text-base leading-relaxed text-slate-600">
                {ct(vt.active
                  ? "Agencies can select this programme, they see its DZD price and processing time, and its document checklist is enforced on submit."
                  : "Only staff can see this programme. Agencies cannot start an application against it.")}
              </p>
              {canManage ? (
                <form action={updateVisaTypeAction}>
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="back" value={`/admin/config/visa-types/${id}`} />
                  <input type="hidden" name="toggle" value="1" />
                  <SubmitButton className={vt.active ? "btn-danger btn-sm" : "btn-primary btn-sm"} pendingLabel="…">
                    {ct(vt.active ? "Unpublish" : "Publish to agencies")}
                  </SubmitButton>
                </form>
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHeader title={ct("Information")} subtitle={ct("Internal and agency-facing name of this programme.")} testId="vt-section-information" />
            <KeyValue
              items={[
                { label: ct("Code"), value: vt.code },
                { label: ct("Description"), value: configDescription(vt, locale) || "—" },
                { label: ct("Category"), value: categories.find((c) => c.id === vt.categoryId) ? configName(categories.find((c) => c.id === vt.categoryId)!, locale) : ct("No category") },
              ]}
            />
          </Card>

          {canManage ? (
            <Card>
              <CardHeader title={ct("Edit programme")} subtitle={ct("Existing applications keep their snapshot; new applications use these values.")} />
              <form action={updateVisaTypeAction} className="space-y-4 px-4 py-4">
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="back" value={`/admin/config/visa-types/${id}`} />
                <fieldset className="space-y-4 rounded-lg border border-line/80 bg-ivory-50/50 p-4" data-testid="vt-section-information-edit">
                  <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-slate-400">{ct("Information")}</legend>
                  <div>
                    <label className="label" htmlFor="e-name">{ct("Name *")} · EN</label>
                    <input id="e-name" name="name" required minLength={2} maxLength={120} dir="ltr" defaultValue={vt.name} className="input" />
                  </div>
                  <div>
                    <label className="label" htmlFor="e-code">{ct("Code")}</label>
                    <input id="e-code" name="code" readOnly dir="ltr" defaultValue={vt.code} className="input" />
                  </div>
                  <div>
                    <label className="label" htmlFor="e-country">{ct("Country *")}</label>
                    <select id="e-country" name="countryId" required defaultValue={vt.countryId} className="input">
                      {countries.filter((c) => c.active || c.id === vt.countryId).map((c) => <option key={c.id} value={c.id}>{countryName(c, locale)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="e-category">{ct("Category *")}</label>
                    <select id="e-category" name="categoryId" required defaultValue={vt.categoryId} className="input">
                      {categories.filter((c) => c.active || c.id === vt.categoryId).map((c) => <option key={c.id} value={c.id}>{configName(c, locale)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="e-desc">{ct("Description")} · EN</label>
                    <textarea id="e-desc" name="description" rows={2} maxLength={1000} dir="ltr" defaultValue={vt.description ?? ""} className="input" />
                    <ConfigTranslations value={vt} locale={locale} />
                  </div>
                </fieldset>
                <fieldset className="space-y-4 rounded-lg border border-line/80 bg-ivory-50/50 p-4" data-testid="vt-section-pricing">
                  <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-slate-400">{ct("Pricing (DZD)")}</legend>
                  <div>
                    <label className="label" htmlFor="e-fee">{ct("Fee (DZD) *")}</label>
                    <input id="e-fee" name="fee" type="number" step="0.01" min="0" required defaultValue={vt.fee} className="input" />
                    <input name="currency" value="DZD" type="hidden" />
                    <p className="mt-2 text-xs text-slate-500">
                      <bdi dir="ltr">{formatAmount(vt.fee, "DZD", locale)}</bdi> — {ct("Charged in Algerian dinar from the agency prepaid balance at submission. Applications already submitted keep the price they were charged at.")}
                    </p>
                  </div>
                </fieldset>
                <fieldset className="space-y-4 rounded-lg border border-line/80 bg-ivory-50/50 p-4" data-testid="vt-section-processing">
                  <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-slate-400">{ct("Processing")}</legend>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="label" htmlFor="e-min">{ct("Min days (0 = on request) *")}</label>
                      <input id="e-min" name="processingMinDays" type="number" min="0" required defaultValue={vt.processingMinDays} className="input" />
                    </div>
                    <div>
                      <label className="label" htmlFor="e-max">{ct("Max days (0 = on request) *")}</label>
                      <input id="e-max" name="processingMaxDays" type="number" min="0" required defaultValue={vt.processingMaxDays} className="input" />
                    </div>
                  </div>
                  <p className="text-xs text-slate-500">
                    {ct("Shown to agencies as")} {formatProcessingDays(vt.processingMinDays, vt.processingMaxDays, locale)}. {ct("Zero means on request, never zero days.")}
                  </p>
                </fieldset>
                <fieldset className="rounded-lg border border-line/80 bg-ivory-50/50 p-4" data-testid="vt-section-workflow">
                  <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-slate-400">{ct("Workflow")}</legend>
                  <label className="label" htmlFor="e-embassy">{ct("Embassy / external authority step")}</label>
                  <select
                    id="e-embassy"
                    name="embassyApplicability"
                    defaultValue={(vt as { embassyApplicability?: string }).embassyApplicability ?? "OPTIONAL"}
                    className="input"
                  >
                    <option value="NOT_APPLICABLE">{ct("Not applicable — this programme never goes to an embassy")}</option>
                    <option value="OPTIONAL">{ct("Optional — staff may send it, never required")}</option>
                    <option value="APPLICABLE">{ct("Applicable — the embassy stage is part of this programme")}</option>
                  </select>
                  <p className="mt-2 text-xs text-slate-500">
                    {ct("When a programme is not applicable, staff cannot move an application to the embassy stage and agencies do not see an embassy step.")}
                  </p>
                </fieldset>
                <SubmitButton className="btn-primary w-full" pendingLabel={ct("Saving…")}>{ct("Save visa type")}</SubmitButton>
              </form>
              <form action={deleteVisaTypeAction} className="border-t border-line px-4 py-4">
                <input type="hidden" name="id" value={id} />
                <p className="mb-4 text-xs text-slate-500">{ct("Only unused configuration can be deleted. Referenced records must be deactivated.")}</p>
                <ConfirmButton className="btn-danger btn-sm" message={ct("Delete this unused visa type?")}>{ct("Delete visa type")}</ConfirmButton>
              </form>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
