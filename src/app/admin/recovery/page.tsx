import { adminPageUser } from "@/lib/page-auth";
import { getUiLocale } from "@/lib/ui-i18n";
import { identityT } from "@/lib/identity-copy";
import { contentT } from "@/lib/i18n-content";
import { listRecoveryQueue } from "@/lib/account-recovery";
import { AccessLinkForm } from "@/components/access-link-form";
import { closeRecoveryAction } from "@/app/actions/recovery";
import { SubmitButton } from "@/components/forms";
import { EmptyState, PageHeader, TableWrap } from "@/components/ui";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function RecoveryQueuePage() {
  const actor = await adminPageUser(), locale = await getUiLocale(), t = identityT(locale), ct = contentT(locale);
  if (actor.role !== "SUPER_ADMIN") return <><PageHeader title={t("Access recovery")} /><EmptyState title={ct("Not authorized")} /></>;
  const queue = await listRecoveryQueue(actor);
  return <>
    <PageHeader title={t("Recovery requests")} subtitle={t("Review requests and verify the account holder before sharing a single-use link.")} />
    {!queue.length ? <EmptyState title={t("No pending recovery requests")} /> : <TableWrap>
      <thead><tr><th className="th">{ct("User")}</th><th className="th">{ct("Agency")}</th><th className="th">{ct("Created")}</th><th className="th">{ct("Actions")}</th></tr></thead>
      <tbody>{queue.map((row) => <tr key={row.request.id}>
        <td className="td"><p className="font-medium">{row.name ?? t("Account not found")}</p><p className="text-xs text-slate-500" dir="ltr">{row.request.identifier}</p></td>
        <td className="td">{row.request.userId ? row.agencyName ?? t("Staff") : "—"}</td>
        <td className="td whitespace-nowrap text-xs">{formatDateTime(row.request.createdAt, locale)}</td>
        <td className="td space-y-3">
          {row.request.userId && row.userStatus === "ACTIVE" && (!row.agencyId || row.agencyStatus === "ACTIVE") ? <AccessLinkForm userId={row.request.userId} requestId={row.request.id} locale={locale} /> : null}
          <form action={closeRecoveryAction}><input type="hidden" name="requestId" value={row.request.id} /><SubmitButton className="btn-secondary btn-sm" pendingLabel="…">{t("Close request")}</SubmitButton></form>
        </td>
      </tr>)}</tbody>
    </TableWrap>}
  </>;
}
