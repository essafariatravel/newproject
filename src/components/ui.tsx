import Link from "next/link";
import type { ReactNode } from "react";

/* ------------------------------ primitives ------------------------------ */

export function PageHeader(props: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="page-header-title font-semibold tracking-tight text-navy-900">{props.title}</h1>
        {props.subtitle ? <p className="page-header-subtitle mt-1 text-sm leading-relaxed text-slate-500">{props.subtitle}</p> : null}
      </div>
      {props.actions ? <div className="flex flex-wrap items-center gap-2">{props.actions}</div> : null}
    </div>
  );
}

export function Card(props: { children: ReactNode; className?: string }) {
  return <div className={`card ${props.className ?? ""}`}>{props.children}</div>;
}

export function CardHeader(props: { title: string; actions?: ReactNode; subtitle?: ReactNode; testId?: string }) {
  return (
    <div className="card-header flex flex-wrap items-center justify-between gap-2 border-b border-line/70 px-6 py-4" data-testid={props.testId}>
      <div>
        <h2 className="text-sm font-semibold text-navy-900">{props.title}</h2>
        {props.subtitle ? <p className="mt-1 text-xs text-slate-500">{props.subtitle}</p> : null}
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
      ? "text-gold-700"
      : props.tone === "teal"
        ? "text-teal-700"
        : props.tone === "navy"
          ? "text-navy-700"
          : "text-slate-500";
  const body = (
    <div className="stat-card card h-full px-4 py-4">
      <p className={`text-base font-medium ${toneClass}`}>{props.label}</p>
      <p className="stat-value mt-1 text-2xl font-semibold leading-snug tracking-tight text-navy-900 tabular-nums">{props.value}</p>
      {props.hint ? <p className="mt-1 text-xs leading-snug text-slate-500">{props.hint}</p> : null}
    </div>
  );
  return props.href ? (
    <Link href={props.href} className="block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-500">
      {body}
    </Link>
  ) : (
    body
  );
}

/* -------------------------------- badges -------------------------------- */



export function titleize(code: string): string {
  return code
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}


export function ActiveBadge({ active, locale = "en" }: { active: boolean; locale?: "en" | "fr" | "ar" }) {
  const labels = { en: ["Active", "Inactive"], fr: ["Actif", "Inactif"], ar: ["نشط", "غير نشط"] };
  return (
    <span className={`badge ${active ? "bg-emerald-50 text-emerald-700" : "bg-ivory-100 text-slate-600"}`}>
      {labels[locale][active ? 0 : 1]}
    </span>
  );
}

/* ----------------------------- state helpers ---------------------------- */

export function EmptyState(props: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-8 text-center">
      <p className="text-sm font-semibold text-navy-900">{props.title}</p>
      {props.body ? <p className="max-w-sm text-base leading-relaxed text-slate-600">{props.body}</p> : null}
      {props.action ? <div className="mt-2">{props.action}</div> : null}
    </div>
  );
}

export function Flash(props: { error?: string; success?: string }) {
  if (!props.error && !props.success) return null;
  return (
    <div
      role="status"
      className={`mb-6 rounded-lg border px-4 py-4 text-sm ${
        props.error
          ? "border-red-100 bg-red-50 text-red-700"
          : "border-emerald-100 bg-emerald-50 text-emerald-700"
      }`}
    >
      {props.error ?? props.success}
    </div>
  );
}

export function TableWrap(props: { children: ReactNode; ariaLabel?: string }) {
  return (
    <div className="card table-scroll overflow-x-auto" tabIndex={0} role={props.ariaLabel ? "region" : undefined} aria-label={props.ariaLabel}>
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
          className="h-full rounded-full bg-teal-600 transition-[width] duration-200 motion-reduce:transition-none"
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
    <div className="workspace-tabs mb-6 flex max-w-full gap-6 overflow-x-auto border-b border-line">
      {props.tabs.map((t) => (
        <Link
          key={t.id}
          href={t.href}
          aria-current={t.id === props.current ? "page" : undefined}
          className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm transition-colors ${
            t.id === props.current
              ? "border-gold-500 font-semibold text-navy-900"
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
    <dl className="grid grid-cols-1 gap-x-6 gap-y-4 px-6 py-6 sm:grid-cols-2 lg:grid-cols-3">
      {props.items.map((item) => (
        <div key={item.label}>
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">{item.label}</dt>
          <dd className="mt-1 text-sm font-medium text-navy-900">{item.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
