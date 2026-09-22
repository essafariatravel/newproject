import Link from "next/link";

/**
 * Phase 2.2 §5 — the 4-step application request wizard rail.
 *
 * Pure server component: parents pass localized labels + the current step.
 * Steps: 1 CHOOSE VISA → 2 APPLICANT INFO → 3 UPLOAD DOCS → 4 REVIEW & SUBMIT.
 * The rail reuses the existing single-page flows (no duplicated actions).
 */
export interface WizardStep {
  id: number;
  label: string;
  /** optional link for steps the user may revisit (draft stage allows going back) */
  href?: string;
  /** caption under the label, e.g. the config info (destination/programme) */
  hint?: string;
}

export function WizardSteps(props: {
  steps: WizardStep[];
  /** 1-based id of the current step */
  current: number;
}) {
  return (
    <nav aria-label="Application request wizard" className="mb-5">
      <ol className="flex flex-wrap items-stretch gap-2">
        {props.steps.map((s) => {
          const done = s.id < props.current;
          const current = s.id === props.current;
          const badge = (
            <span
              aria-hidden="true"
              className={[
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                current
                  ? "bg-iris-600 text-white shadow-[0_8px_16px_-8px_rgb(74_91_208/0.8)]"
                  : done
                    ? "bg-emerald-500 text-white"
                    : "border border-ivory-300 bg-white text-slate-400",
              ].join(" ")}
            >
              {done ? "✓" : s.id}
            </span>
          );
          const body = (
            <span className="min-w-0">
              <span
                className={[
                  "block truncate text-sm font-semibold",
                  current ? "text-navy-900" : done ? "text-emerald-700" : "text-slate-400",
                ].join(" ")}
                aria-current={current ? "step" : undefined}
              >
                {s.label}
              </span>
              {s.hint ? <span className="block truncate text-[11px] text-slate-400">{s.hint}</span> : null}
            </span>
          );
          const cls =
            "flex flex-1 min-w-[180px] items-center gap-2.5 rounded-2xl border px-3 py-2.5 transition-colors " +
            (current
              ? "border-iris-300 bg-iris-50/60"
              : done
                ? "border-emerald-200 bg-emerald-50/50"
                : "border-ivory-200 bg-white/60");
          return (
            <li key={s.id} className="contents">
              {s.href && !current ? (
                <Link href={s.href} className={cls}>
                  {badge}
                  {body}
                </Link>
              ) : (
                <div className={cls} aria-disabled={!current && !s.href ? true : undefined}>
                  {badge}
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
