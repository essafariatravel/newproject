import Link from "next/link";
import type { ReactNode } from "react";

/* ------------------------------ primitives ------------------------------ */

export function PageHeader(props: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-serif text-[1.75rem] leading-tight text-navy-900">{props.title}</h1>
        {props.subtitle ? <p className="mt-1 text-sm text-slate-500">{props.subtitle}</p> : null}
      </div>
      {props.actions ? <div className="flex flex-wrap items-center gap-2">{props.actions}</div> : null}
    </div>
  );
}

export function Card(props: { children: ReactNode; className?: string }) {
  return <div className={`card ${props.className ?? ""}`}>{props.children}</div>;
}

export function CardHeader(props: { title: string; actions?: ReactNode; subtitle?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/70 px-5 py-3.5">
      <div>
        <h2 className="text-sm font-bold text-navy-900">{props.title}</h2>
        {props.subtitle ? <p className="mt-0.5 text-xs text-slate-400">{props.subtitle}</p> : null}
      </div>
      {props.actions ? <div className="flex items-center gap-2">{props.actions}</div> : null}
    </div>
  );
}

export function StatCard(props: {
  label: string;
  value: ReactNode;
  hint?: string;
  href?: string;
  tone?: "default" | "gold" | "teal" | "navy";
}) {
  const toneClass =
    props.tone === "gold"
      ? "border-gold-100 bg-gradient-to-b from-gold-50/80 to-white"
      : props.tone === "teal"
        ? "border-teal-100 bg-gradient-to-b from-teal-50/70 to-white"
        : props.tone === "navy"
          ? "border-iris-100 bg-gradient-to-b from-iris-50/70 to-white"
          : "";
  const body = (
    <div className={`card h-full border px-5 py-4 ${toneClass}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">{props.label}</p>
      <p className="mt-1.5 font-serif text-[1.65rem] leading-snug text-navy-900 tabular-nums">{props.value}</p>
      {props.hint ? <p className="mt-1 text-xs text-slate-400">{props.hint}</p> : null}
    </div>
  );
  return props.href ? (
    <Link href={props.href} className="block transition-transform hover:-translate-y-0.5">
      {body}
    </Link>
  ) : (
    body
  );
}

/* -------------------------------- badges -------------------------------- */

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

function titleize(code: string): string {
  return code
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function StatusBadge({ code, name }: { code: string; name?: string }) {
  return (
    <span className={`badge ${STATUS_STYLES[code] ?? "bg-ivory-100 text-slate-500"}`}>
      {name ?? titleize(code)}
    </span>
  );
}

export function DocStatusBadge({ status }: { status: string }) {
  return (
    <span className={`badge ${DOC_STATUS_STYLES[status] ?? "bg-ivory-100 text-slate-500"}`}>
      {titleize(status)}
    </span>
  );
}

export function PriorityBadge({ name, weight }: { name: string; weight: number }) {
  const style =
    weight >= 10
      ? "bg-red-50 text-red-700"
      : weight >= 5
        ? "bg-amber-50 text-amber-700"
        : "bg-ivory-100 text-slate-500";
  return <span className={`badge ${style}`}>{name}</span>;
}

export function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span className={`badge ${active ? "bg-emerald-50 text-emerald-700" : "bg-ivory-100 text-slate-400"}`}>
      {active ? "Active" : "Inactive"}
    </span>
  );
}

/* ----------------------------- state helpers ---------------------------- */

export function EmptyState(props: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2.5 px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-ivory-100 text-lg text-gold-500">
        ✦
      </div>
      <p className="text-sm font-semibold text-navy-900">{props.title}</p>
      {props.body ? <p className="max-w-sm text-xs leading-relaxed text-slate-400">{props.body}</p> : null}
      {props.action ? <div className="mt-2">{props.action}</div> : null}
    </div>
  );
}

export function Flash(props: { error?: string; success?: string }) {
  if (!props.error && !props.success) return null;
  return (
    <div
      role="status"
      className={`mb-5 rounded-2xl border px-4 py-3 text-sm ${
        props.error
          ? "border-red-100 bg-red-50 text-red-700"
          : "border-emerald-100 bg-emerald-50 text-emerald-700"
      }`}
    >
      {props.error ?? props.success}
    </div>
  );
}

export function TableWrap(props: { children: ReactNode }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse">{props.children}</table>
    </div>
  );
}

export function Progress(props: { done: number; total: number }) {
  const pct = props.total === 0 ? 100 : Math.round((props.done / props.total) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-ivory-200">
        <div
          className="h-full rounded-full bg-gradient-to-r from-iris-400 to-iris-600 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-slate-400">
        {props.done}/{props.total}
      </span>
    </div>
  );
}

export function Tabs(props: { tabs: Array<{ id: string; label: string; href: string }>; current: string }) {
  return (
    <div className="ess-segment mb-6 max-w-full overflow-x-auto">
      {props.tabs.map((t) => (
        <Link
          key={t.id}
          href={t.href}
          className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm transition-colors ${
            t.id === props.current
              ? "bg-white font-semibold text-navy-900 shadow-[0_1px_3px_rgb(23_30_63/0.08)]"
              : "text-slate-500 hover:text-navy-900"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

export function KeyValue(props: { items: Array<{ label: string; value: ReactNode }> }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-4 px-5 py-5 sm:grid-cols-2 lg:grid-cols-3">
      {props.items.map((item) => (
        <div key={item.label}>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">{item.label}</dt>
          <dd className="mt-0.5 text-sm font-medium text-navy-900">{item.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
