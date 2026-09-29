import Link from "next/link";
import { portalPageUser } from "@/lib/page-auth";
import { listAllDocuments } from "@/lib/queries";
import { flashFrom } from "@/lib/action-helpers";
import { bytes, formatDateTime } from "@/lib/format";
import { FilterBar, Pagination } from "@/components/app-widgets";
import { EmptyState, Flash, PageHeader, TableWrap } from "@/components/ui";
import { DocStatusBadge } from "@/components/badges";
import { getUiLocale } from "@/lib/ui-i18n";
import { contentT } from "@/lib/i18n-content";

export const dynamic = "force-dynamic";

export default async function PortalDocumentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const sp: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(raw)) sp[k] = typeof v === "string" ? v : undefined;
  const user = await portalPageUser();
  const locale = await getUiLocale(raw);
  const ct = contentT(locale);
  const flash = flashFrom(sp);
  const page = Number(sp.page ?? "1") || 1;
  const result = await listAllDocuments({ status: sp.status, q: sp.q, page, agencyId: user.agencyId });

  return (
    <div className="travel-list travel-workspace">
      <PageHeader title={ct("Documents")} subtitle={ct("All documents uploaded by your agency.")} />
      <Flash {...flash} />

      <FilterBar
        action="/portal/documents"
        locale={locale}
        fields={[
          { name: "q", label: ct("Search"), type: "text", value: sp.q, placeholder: ct("Filename or reference…") },
          {
            name: "status",
            label: ct("Review status"),
            type: "select",
            value: sp.status,
            options: [
              { value: "UPLOADED", label: ct("Uploaded") },
              { value: "UNDER_REVIEW", label: ct("Under review") },
              { value: "ACCEPTED", label: ct("Accepted") },
              { value: "REJECTED", label: ct("Rejected") },
              { value: "RESUBMISSION_REQUIRED", label: ct("Resubmission required") },
            ],
          },
        ]}
      />

      {result.rows.length === 0 ? (
        <EmptyState title={ct("No documents found")} body={ct("Upload documents from an application's checklist.")} />
      ) : (
        <>
          <div className="travel-record-list md:hidden">
            {result.rows.map(({ doc, applicationReference, documentTypeName }) => (
              <div key={doc.id} className="travel-record">
                <div className="travel-record-primary">
                  <a href={`/api/documents/${doc.id}`} target="_blank" rel="noopener noreferrer" className="travel-record-title truncate hover:underline">
                    {doc.originalFilename}
                  </a>
                  <DocStatusBadge status={doc.status} />
                </div>
                <p className="travel-record-subtitle">{documentTypeName}</p>
                <div className="travel-record-meta">
                  <Link href={`/portal/applications/${doc.applicationId}`} className="hover:underline">{applicationReference}</Link>
                  <span>{bytes(doc.sizeBytes)}</span>
                  <span>{formatDateTime(doc.createdAt, locale)}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden md:block">
            <TableWrap>
              <thead className="border-b border-line">
                <tr>
                  <th className="th">{ct("File")}</th>
                  <th className="th">{ct("Type")}</th>
                  <th className="th">{ct("Application")}</th>
                  <th className="th">{ct("Size")}</th>
                  <th className="th">{ct("Review status")}</th>
                  <th className="th">{ct("Uploaded")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {result.rows.map(({ doc, applicationReference, documentTypeName }) => (
                  <tr key={doc.id} className="tr-hover">
                    <td className="td max-w-[260px]">
                      <a href={`/api/documents/${doc.id}`} target="_blank" rel="noopener noreferrer" className="block truncate font-medium text-navy-900 hover:underline">
                        {doc.originalFilename}
                      </a>
                    </td>
                    <td className="td">{documentTypeName}</td>
                    <td className="td">
                      <Link href={`/portal/applications/${doc.applicationId}`} className="text-navy-800 hover:underline">
                        {applicationReference}
                      </Link>
                    </td>
                    <td className="td whitespace-nowrap text-xs">{bytes(doc.sizeBytes)}</td>
                    <td className="td"><DocStatusBadge status={doc.status} /></td>
                    <td className="td whitespace-nowrap text-xs text-slate-500">{formatDateTime(doc.createdAt, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </div>
          <Pagination locale={locale} page={result.page} pageCount={result.pageCount} total={result.total} basePath="/portal/documents" query={{ q: sp.q, status: sp.status }} />
        </>
      )}
    </div>
  );
}
