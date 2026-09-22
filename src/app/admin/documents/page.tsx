import Link from "next/link";
import { pageUser } from "@/lib/page-auth";
import { hasPermission } from "@/lib/rbac";
import { listAllDocuments } from "@/lib/queries";
import { flashFrom } from "@/lib/action-helpers";
import { formatDateTime, bytes } from "@/lib/format";
import { FilterBar, Pagination } from "@/components/app-widgets";
import { EmptyState, Flash, PageHeader, TableWrap } from "@/components/ui";
import { DocStatusBadge } from "@/components/badges";

export const dynamic = "force-dynamic";

export default async function AdminDocumentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const user = await pageUser();
  if (!hasPermission(user, "documents.view.all")) {
    return (
      <>
        <PageHeader title="Documents" />
        <div className="card"><EmptyState title="Not authorized" body="Your role cannot browse the document pool." /></div>
      </>
    );
  }
  const flash = flashFrom(sp);
  const status = typeof sp.status === "string" ? sp.status : undefined;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const page = Number(sp.page ?? "1") || 1;
  const result = await listAllDocuments({ status, q, page });

  return (
    <>
      <PageHeader title="Documents" subtitle="Every visa document across agencies. Review files from the application workspace." />
      <Flash {...flash} />

      <FilterBar
        action="/admin/documents"
        fields={[
          { name: "q", label: "Search", type: "text", value: q, placeholder: "Filename or application reference…" },
          {
            name: "status",
            label: "Review status",
            type: "select",
            value: status,
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
        <div className="card"><EmptyState title="No documents found" /></div>
      ) : (
        <>
          <TableWrap>
            <thead className="border-b border-slate-100 bg-ivory-50/60">
              <tr>
                <th className="th">File</th>
                <th className="th">Type</th>
                <th className="th">Application</th>
                <th className="th">Agency</th>
                <th className="th">Size</th>
                <th className="th">Status</th>
                <th className="th">Uploaded</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {result.rows.map(({ doc, applicationReference, agencyName, documentTypeName }) => (
                <tr key={doc.id} className="tr-hover">
                  <td className="td max-w-[220px]">
                    <a href={`/api/documents/${doc.id}`} target="_blank" rel="noopener noreferrer" className="block truncate font-medium text-navy-900 hover:underline">
                      {doc.originalFilename}
                    </a>
                  </td>
                  <td className="td">{documentTypeName}</td>
                  <td className="td">
                    <Link href={`/admin/applications/${doc.applicationId}`} className="text-navy-800 hover:underline">
                      {applicationReference}
                    </Link>
                  </td>
                  <td className="td max-w-[160px] truncate">{agencyName}</td>
                  <td className="td whitespace-nowrap text-xs">{bytes(doc.sizeBytes)}</td>
                  <td className="td"><DocStatusBadge status={doc.status} /></td>
                  <td className="td whitespace-nowrap text-xs text-slate-500">{formatDateTime(doc.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
          <Pagination page={result.page} pageCount={result.pageCount} total={result.total} basePath="/admin/documents" query={{ q, status }} />
        </>
      )}
    </>
  );
}
