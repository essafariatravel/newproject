import Link from "next/link";
import { DatePicker } from "@/components/date-picker";
import { contentT } from "@/lib/i18n-content";

export type FilterBarLocale = "en" | "fr" | "ar";

export interface FilterField {
  name: string;
  label: string;
  type: "text" | "date" | "select";
  value?: string;
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
}

/** GET-form filter bar — fully server-rendered, no client JS. Chrome strings localised via contentT. */
export function FilterBar(props: {
  action: string;
  fields: FilterField[];
  hidden?: Record<string, string>;
  /** Interface locale — required for localized date-pickers (§8). */
  locale?: FilterBarLocale;
}) {
  const ct = contentT(props.locale ?? "en");
  return (
    <form method="get" action={props.action} className="filter-bar flex flex-wrap items-end gap-4">
      {Object.entries(props.hidden ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {props.fields.map((f) => (
        <div key={f.name} className={f.type === "text" ? "min-w-[200px] flex-1" : ""}>
          <label htmlFor={`f-${f.name}`} className="label">{f.label}</label>
          {f.type === "select" ? (
            <select id={`f-${f.name}`} name={f.name} defaultValue={f.value ?? ""} className="input">
              <option value="">{ct("All")}</option>
              {f.options?.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : f.type === "date" ? (
            <DatePicker
              id={`f-${f.name}`}
              ariaLabel={f.label}
              name={f.name}
              defaultValue={f.value ?? ""}
              locale={props.locale ?? "en"}
              placeholder={f.placeholder}
            />
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
        <button type="submit" className="btn-primary btn-sm">{ct("Filter")}</button>
        <Link href={props.action} className="filter-reset">{ct("Reset")}</Link>
      </div>
    </form>
  );
}

/**
 * §pagination standard — 20 / 50 / 100 rows per page.
 * Rendered as plain links carrying the current filters, so the choice survives
 * refresh, back navigation and sharing, and no client state is required.
 */
export function PageSizeSelector(props: {
  pageSize: number;
  basePath: string;
  query?: Record<string, string | undefined>;
  locale?: FilterBarLocale;
}) {
  const ct = contentT(props.locale ?? "en");
  const mk = (size: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(props.query ?? {})) {
      if (v && k !== "page" && k !== "per") params.set(k, v);
    }
    if (size !== 20) params.set("per", String(size));
    const qs = params.toString();
    return `${props.basePath}${qs ? `?${qs}` : ""}`;
  };
  return (
    <div className="flex items-center gap-2 text-base text-slate-500" data-testid="page-size">
      <span>{ct("Rows per page")}:</span>
      {[20, 50, 100].map((size) => (
        <Link
          key={size}
          href={mk(size)}
          className="page-size-option"
          data-testid={`page-size-${size}`}
          aria-current={props.pageSize === size ? "page" : undefined}
        >
          {size}
        </Link>
      ))}
    </div>
  );
}

export function Pagination(props: {
  page: number;
  pageCount: number;
  total: number;
  basePath: string;
  query?: Record<string, string | undefined>;
  locale?: FilterBarLocale;
}) {
  const { page, pageCount } = props;
  const ct = contentT(props.locale ?? "en");
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
    <div className="flex items-center justify-between gap-4 px-1 py-2 text-base">
      <p className="text-xs text-slate-500">
        {props.total} {ct(props.total === 1 ? "result" : "results")} · {ct("page")} {page} {ct("of")} {pageCount}
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={mk(page - 1)} className="pagination-link">
            <span className="directional" aria-hidden>←</span> {ct("Previous")}
          </Link>
        ) : (
          <span className="pagination-link" aria-disabled="true"><span className="directional" aria-hidden>←</span> {ct("Previous")}</span>
        )}
        {page < pageCount ? (
          <Link href={mk(page + 1)} className="pagination-link">
            {ct("Next")} <span className="directional" aria-hidden>→</span>
          </Link>
        ) : (
          <span className="pagination-link" aria-disabled="true">{ct("Next")} <span className="directional" aria-hidden>→</span></span>
        )}
      </div>
    </div>
  );
}
