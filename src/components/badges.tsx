import { getUiLocale, localizedDocStatus, localizedPriority, localizedStatusName } from "@/lib/ui-i18n";
import { titleize } from "@/components/ui";

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-ivory-100 text-slate-500",
  SUBMITTED: "bg-teal-50 text-teal-700",
  DOCUMENTS_REQUIRED: "bg-amber-50 text-amber-700",
  UNDER_REVIEW: "bg-sky-50 text-sky-700",
  PROCESSING: "bg-iris-50 text-iris-700",
  EMBASSY_SUBMISSION: "bg-purple-50 text-purple-700",
  AWAITING_DECISION: "bg-fuchsia-50 text-fuchsia-700",
  APPROVED: "bg-emerald-50 text-emerald-700",
  REFUSED: "bg-red-50 text-red-700",
  COMPLETED: "bg-navy-50 text-navy-700",
  CANCELLED: "bg-ivory-100 text-slate-500",
  // agency registration workflow
  PENDING: "bg-amber-50 text-amber-700",
  MORE_INFORMATION_REQUIRED: "bg-orange-50 text-orange-700",
  REJECTED: "bg-red-50 text-red-700",
};

const DOC_STATUS_STYLES: Record<string, string> = {
  UPLOADED: "bg-ivory-100 text-slate-500",
  UNDER_REVIEW: "bg-sky-50 text-sky-700",
  ACCEPTED: "bg-emerald-50 text-emerald-700",
  REJECTED: "bg-red-50 text-red-700",
  RESUBMISSION_REQUIRED: "bg-amber-50 text-amber-700",
};

export async function StatusBadge({ code, name }: { code: string; name?: string }) {
  const locale = await getUiLocale();
  const label = localizedStatusName(code, name ?? titleize(code), locale);
  return <span className={`badge ${STATUS_STYLES[code] ?? "bg-ivory-100 text-slate-500"}`}>{label}</span>;
}

export async function DocStatusBadge({ status }: { status: string }) {
  const locale = await getUiLocale();
  return (
    <span className={`badge ${DOC_STATUS_STYLES[status] ?? "bg-ivory-100 text-slate-500"}`}>
      {localizedDocStatus(status, locale, titleize(status))}
    </span>
  );
}

export async function PriorityBadge({ name, weight }: { name: string; weight: number }) {
  const style =
    weight >= 10
      ? "bg-red-50 text-red-700"
      : weight >= 5
        ? "bg-amber-50 text-amber-700"
        : "bg-ivory-100 text-slate-500";
  const locale = await getUiLocale();
  return <span className={`badge ${style}`}>{localizedPriority(name.toUpperCase().replaceAll(" ", "_"), name, locale)}</span>;
}

export { STATUS_STYLES, DOC_STATUS_STYLES };
