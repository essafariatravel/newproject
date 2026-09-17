import Link from "next/link";

export interface FilterField {
  name: string;
  label: string;
  type: "text" | "date" | "select";
  value?: string;
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
}

/** GET-form filter bar — fully server-rendered, no client JS. */
export function FilterBar(props: {
  action: string;
  fields: FilterField[];
  hidden?: Record<string, string>;
}) {
  return (
    <form method="get" action={props.action} className="card mb-4 flex flex-wrap items-end gap-3 p-4">
      {Object.entries(props.hidden ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {props.fields.map((f) => (
        <div key={f.name} className={f.type === "text" ? "min-w-[200px] flex-1" : ""}>
          <label htmlFor={`f-${f.name}`} className="label">{f.label}</label>
          {f.type === "select" ? (
            <select id={`f-${f.name}`} name={f.name} defaultValue={f.value ?? ""} className="input">
              <option value="">All</option>
              {f.options?.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              id={`f-${f.name}`}
              name={f.name}
              type={f.type}
              defaultValue={f.value ?? ""}
              placeholder={f.placeholder}
              className="input"
            />
          )}
        </div>
      ))}
      <div className="flex gap-2">
        <button type="submit" className="btn-primary btn-sm px-4 py-2">Filter</button>
        <Link href={props.action} className="btn-secondary btn-sm px-4 py-2">Reset</Link>
      </div>
    </form>
  );
}

export function Pagination(props: {
  page: number;
  pageCount: number;
  total: number;
  basePath: string;
  query?: Record<string, string | undefined>;
}) {
  const { page, pageCount } = props;
  const mk = (p: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(props.query ?? {})) {
      if (v) params.set(k, v);
    }
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return `${props.basePath}${qs ? `?${qs}` : ""}`;
  };
  return (
    <div className="flex items-center justify-between gap-3 px-1 py-3 text-sm">
      <p className="text-xs text-slate-500">
        {props.total} result{props.total === 1 ? "" : "s"} · page {page} of {pageCount}
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={mk(page - 1)} className="btn-secondary btn-sm">
            ← Previous
          </Link>
        ) : (
          <span className="btn-secondary btn-sm opacity-40">← Previous</span>
        )}
        {page < pageCount ? (
          <Link href={mk(page + 1)} className="btn-secondary btn-sm">
            Next →
          </Link>
        ) : (
          <span className="btn-secondary btn-sm opacity-40">Next →</span>
        )}
      </div>
    </div>
  );
}
