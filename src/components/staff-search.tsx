import Link from "next/link";

/**
 * §28 — global search entry point for the staff header.
 *
 * A plain GET form (no client bundle, works without JavaScript) that submits
 * to /admin/search. On small screens the field is replaced by an icon link so
 * the header never overflows.
 */
export function StaffSearch({ label, placeholder }: { label: string; placeholder: string }) {
  return (
    <>
      <form action="/admin/search" method="get" role="search" className="hidden sm:block">
        <label className="sr-only" htmlFor="staff-search">
          {label}
        </label>
        <div className="relative">
          <input
            id="staff-search"
            name="q"
            type="search"
            autoComplete="off"
            placeholder={placeholder}
            data-testid="header-search-input"
            className="h-9 w-44 rounded-xl border border-ivory-200 bg-white/80 ps-8 pe-3 text-xs text-navy-900 outline-none transition-colors placeholder:text-slate-400 focus:border-iris-300 lg:w-64"
          />
          <svg
            className="pointer-events-none absolute inset-y-0 start-2.5 my-auto h-3.5 w-3.5 text-slate-400"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden
          >
            <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10.5 10.5 14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      </form>
      <Link
        href="/admin/search"
        aria-label={label}
        data-testid="header-search-link"
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-ivory-200 bg-white text-slate-500 sm:hidden"
      >
        <svg viewBox="0 0 16 16" fill="none" aria-hidden width="14" height="14">
          <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M10.5 10.5 14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </Link>
    </>
  );
}
