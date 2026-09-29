import Link from "next/link";
import { agencyPrimaryLabel } from "@/lib/agency-display";

export function AgencyListIdentity(props: {
  id: string;
  legalName: string | null;
  tradingName: string | null;
  email: string;
}) {
  const label = agencyPrimaryLabel(props);
  return (
    <span className="min-w-0">
      <Link
        href={`/admin/agencies/${props.id}`}
        className="block truncate font-medium text-navy-900 hover:underline"
      >
        {label}
      </Link>
      <span className="block truncate text-xs text-slate-400">{props.email}</span>
    </span>
  );
}
