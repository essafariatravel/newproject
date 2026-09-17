import Link from "next/link";
import { portalPageUser } from "@/lib/page-auth";
import { listAllDocuments } from "@/lib/queries";
import { flashFrom } from "@/lib/action-helpers";
import { bytes, formatDateTime } from "@/lib/format";
import { FilterBar, Pagination } from "@/components/app-widgets";
import { DocStatusBadge, EmptyState, Flash, PageHeader, TableWrap } from "@/components/ui";

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
  const flash = flashFrom(sp);
  const page = Number(sp.page ?? "1") || 1;
  const result = await listAllDocuments({ status: sp.status, q: sp.q, page, agencyId: user.agencyId });

  return (
    <>
      <PageHeader title="Documents" subtitle="All documents uploaded by your agency." />
      <Flash {...flash} />

      <FilterBar
        action="/portal/documents"
        fields={[
          { name: "q", label: "Search", type: "text", value: sp.q, placeholder: "Filename or reference…" },
          {
            name: "status",
            label: "Review status",
            type: "select",
            value: sp.status,
            options: [
              { value: "UPLOADED", label: "Uploaded" },
              { value: "UNDER_REVIEW", label: "Under review" },
              { value: "ACCEPTED", label: "Accepted" },
              { value: "REJECTED", label: "Rejected" },
              { value: "RESUBMISSION_REQUIRED", label: "Resubmission required" },
            ],
          },
        ]}
      />

      {result.rows.length === 0 ? (
        <div className="card"><EmptyState title="No documents found" body="Upload documents from an application's checklist." /></div>
      ) : (
        <>
          <TableWrap>
            <thead className="border-b border-slate-100 bg-ivory-50/60">
              <tr>
                <th className="th">File</th>
                <th className="th">Type</th>
                <th className="th">Application</th>
                <th className="th">Size</th>
                <th className="th">Review status</th>
                <th className="th">Uploaded</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {result.rows.map(({ doc, applicationReference, documentTypeName }) => (
                <tr key={doc.id} className="tr-hover">
                  <td className="td max-w-[220px]">
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
                  <td className="td whitespace-nowrap text-xs text-slate-500">{formatDateTime(doc.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
          <Pagination page={result.page} pageCount={result.pageCount} total={result.total} basePath="/portal/documents" query={{ q: sp.q, status: sp.status }} />
        </>
      )}
    </>
  );
}
