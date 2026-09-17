import Link from "next/link";
import type { ReactNode } from "react";

/* ------------------------------ primitives ------------------------------ */

export function PageHeader(props: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-serif text-2xl text-navy-900">{props.title}</h1>
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
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
      <div>
        <h2 className="text-sm font-semibold text-navy-900">{props.title}</h2>
        {props.subtitle ? <p className="mt-0.5 text-xs text-slate-500">{props.subtitle}</p> : null}
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
  const toneRing =
    props.tone === "gold"
      ? "border-gold-400/40"
      : props.tone === "teal"
        ? "border-teal-500/30"
        : props.tone === "navy"
          ? "border-navy-700/30"
          : "border-slate-200";
  const body = (
    <div className={`card h-full border ${toneRing} px-4 py-3.5`}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{props.label}</p>
      <p className="mt-1 font-serif text-2xl text-navy-900 tabular-nums">{props.value}</p>
      {props.hint ? <p className="mt-1 text-xs text-slate-500">{props.hint}</p> : null}
    </div>
  );
  return props.href ? (
    <Link href={props.href} className="block transition-transform hover:-translate-y-px">
      {body}
    </Link>
  ) : (
    body
  );
}

/* -------------------------------- badges -------------------------------- */

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  SUBMITTED: "bg-teal-100 text-teal-700",
  DOCUMENTS_REQUIRED: "bg-amber-100 text-amber-800",
  UNDER_REVIEW: "bg-sky-100 text-sky-800",
  PROCESSING: "bg-indigo-100 text-indigo-800",
  EMBASSY_SUBMISSION: "bg-purple-100 text-purple-800",
  AWAITING_DECISION: "bg-fuchsia-100 text-fuchsia-800",
  APPROVED: "bg-emerald-100 text-emerald-800",
  REFUSED: "bg-red-100 text-red-700",
  COMPLETED: "bg-navy-800/10 text-navy-800",
  CANCELLED: "bg-slate-200 text-slate-600",
};

const DOC_STATUS_STYLES: Record<string, string> = {
  UPLOADED: "bg-slate-100 text-slate-600",
  UNDER_REVIEW: "bg-sky-100 text-sky-800",
  ACCEPTED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-red-100 text-red-700",
  RESUBMISSION_REQUIRED: "bg-amber-100 text-amber-800",
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
    <span className={`badge ${STATUS_STYLES[code] ?? "bg-slate-100 text-slate-600"}`}>
      {name ?? titleize(code)}
    </span>
  );
}

export function DocStatusBadge({ status }: { status: string }) {
  return (
    <span className={`badge ${DOC_STATUS_STYLES[status] ?? "bg-slate-100 text-slate-600"}`}>
      {titleize(status)}
    </span>
  );
}

export function PriorityBadge({ name, weight }: { name: string; weight: number }) {
  const style =
    weight >= 10
      ? "bg-red-100 text-red-700"
      : weight >= 5
        ? "bg-amber-100 text-amber-800"
        : "bg-slate-100 text-slate-600";
  return <span className={`badge ${style}`}>{name}</span>;
}

export function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span className={`badge ${active ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-500"}`}>
      {active ? "Active" : "Inactive"}
    </span>
  );
}

/* ----------------------------- state helpers ---------------------------- */

export function EmptyState(props: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-ivory-100 text-lg">◦</div>
      <p className="text-sm font-medium text-navy-900">{props.title}</p>
      {props.body ? <p className="max-w-sm text-xs text-slate-500">{props.body}</p> : null}
      {props.action ? <div className="mt-2">{props.action}</div> : null}
    </div>
  );
}

export function Flash(props: { error?: string; success?: string }) {
  if (!props.error && !props.success) return null;
  return (
    <div
      role="status"
      className={`mb-4 rounded-md border px-3.5 py-2.5 text-sm ${
        props.error
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-emerald-200 bg-emerald-50 text-emerald-800"
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
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-teal-600 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-slate-500">
        {props.done}/{props.total}
      </span>
    </div>
  );
}

export function Tabs(props: { tabs: Array<{ id: string; label: string; href: string }>; current: string }) {
  return (
    <div className="mb-5 flex gap-1 overflow-x-auto border-b border-slate-200">
      {props.tabs.map((t) => (
        <Link
          key={t.id}
          href={t.href}
          className={`whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm transition-colors ${
            t.id === props.current
              ? "border-gold-500 font-medium text-navy-900"
              : "border-transparent text-slate-500 hover:text-navy-900"
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
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 px-4 py-4 sm:grid-cols-2 lg:grid-cols-3">
      {props.items.map((item) => (
        <div key={item.label}>
          <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{item.label}</dt>
          <dd className="mt-0.5 text-sm text-slate-800">{item.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
