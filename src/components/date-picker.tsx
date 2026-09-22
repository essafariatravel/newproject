"use client";

/**
 * Single reusable date picker (Phase 2.2 §8).
 *
 * - No external dependency: a hidden `<input name=…>` always carries the
 *   canonical ISO value (YYYY-MM-DD) so existing server actions are untouched.
 * - Localized button label + calendar chrome through Intl.DateTimeFormat
 *   (en / fr / ar); the surrounding page sets `dir`, so RTL flips naturally.
 * - Keyboard: ↑/↓/←/→ move the focused day, PageUp/PageDown switch months,
 *   Home/End jump to week edges, Enter/Space select, Escape closes; Tab order
 *   stays sane (days are roving-tabindex buttons).
 * - Graceful text entry: typing a valid ISO date directly updates the value.
 */
import { useEffect, useMemo, useRef, useState } from "react";

export interface DatePickerProps {
  name: string;
  defaultValue?: string | null;
  required?: boolean;
  min?: string;
  max?: string;
  locale?: "en" | "fr" | "ar";
  id?: string;
  disabled?: boolean;
  className?: string;
  /** Placeholder shown when empty — pass a localized string from the server page. */
  placeholder?: string;
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * The 12-year window shown in the year picker around a pivot year.
 * Exported and pure so tests can verify decades-in-the-past jumps stay cheap
 * (birth-year selection like 1981 from 2026 = 4 range clicks, not months).
 */
export function yearRangeWindow(pivot: number): { start: number; end: number } {
  const start = pivot - (pivot % 12);
  return { start, end: start + 11 };
}

/** Clamp a year/month selection against ISO min/max bounds. */
export function clampYearMonth(
  year: number,
  month: number,
  min?: string,
  max?: string,
): { year: number; month: number } {
  const v = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  if (max && v > `${max.slice(0, 7)}-01`) {
    return { year: Number(max.slice(0, 4)), month: Number(max.slice(5, 7)) - 1 };
  }
  if (min && v < `${min.slice(0, 7)}-01`) {
    return { year: Number(min.slice(0, 4)), month: Number(min.slice(5, 7)) - 1 };
  }
  return { year, month };
}

type PickerView = "days" | "months" | "years";

function iso(year: number, monthIndex: number, day: number): string {
  const m = String(monthIndex + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}
function parseIso(v: string | null | undefined): { y: number; m: number; d: number } | null {
  if (!v) return null;
  const m = ISO.exec(v.trim());
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]) - 1, d = Number(m[3]);
  const dt = new Date(y, mo, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== d) return null;
  return { y, m: mo, d };
}
function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function DatePicker(props: DatePickerProps) {
  const locale = props.locale ?? "en";
  const today = useMemo(() => {
    const t = new Date();
    return { y: t.getFullYear(), m: t.getMonth(), d: t.getDate() };
  }, []);

  const initial = parseIso(props.defaultValue);
  const [value, setValue] = useState<string>(props.defaultValue ?? "");
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(initial?.y ?? today.y);
  const [viewMonth, setViewMonth] = useState(initial?.m ?? today.m);
  const [focusedDay, setFocusedDay] = useState(initial?.d ?? today.d);
  const [view, setView] = useState<PickerView>("days");
  // pivot year drives the 12-year grid in "years" view
  const [pivotYear, setPivotYear] = useState(initial?.y ?? today.y);
  const rootRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const fmtDate = useMemo(
    () => new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric" }),
    [locale],
  );
  const fmtMonth = useMemo(
    () => new Intl.DateTimeFormat(locale, { year: "numeric", month: "long" }),
    [locale],
  );
  const weekdayNames = useMemo(() => {
    const f = new Intl.DateTimeFormat(locale, { weekday: "narrow" });
    // 2024-01-07 was a Sunday; week starts Monday here.
    return Array.from({ length: 7 }, (_, i) => f.format(new Date(2024, 0, 8 + i)));
  }, [locale]);

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstWeekday = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7; // Monday=0

  const allowed = (v: string) =>
    (!props.min || cmp(props.min, v) <= 0) && (!props.max || cmp(v, props.max) <= 0);

  function select(v: string) {
    if (!allowed(v)) return;
    setValue(v);
    setOpen(false);
  }
  function applyText(v: string) {
    setValue(v);
    const p = parseIso(v);
    if (p && allowed(v)) {
      setViewYear(p.y); setViewMonth(p.m); setFocusedDay(p.d);
    }
  }
  function moveMonth(delta: number) {
    let m = viewMonth + delta, y = viewYear;
    while (m < 0) { m += 12; y -= 1; }
    while (m > 11) { m -= 12; y += 1; }
    setViewMonth(m); setViewYear(y);
  }
  function moveDay(deltaDays: number) {
    const cur = new Date(viewYear, viewMonth, focusedDay);
    cur.setDate(cur.getDate() + deltaDays);
    const v = iso(cur.getFullYear(), cur.getMonth(), cur.getDate());
    if (!allowed(v)) return;
    setViewYear(cur.getFullYear());
    setViewMonth(cur.getMonth());
    setFocusedDay(cur.getDate());
  }

  function onGridKeyDown(e: React.KeyboardEvent) {
    const rtl = locale === "ar";
    switch (e.key) {
      case "ArrowLeft":  e.preventDefault(); moveDay(rtl ? 1 : -1); break;
      case "ArrowRight": e.preventDefault(); moveDay(rtl ? -1 : 1); break;
      case "ArrowUp":    e.preventDefault(); moveDay(-7); break;
      case "ArrowDown":  e.preventDefault(); moveDay(7); break;
      case "PageUp":     e.preventDefault(); moveMonth(-1); break;
      case "PageDown":   e.preventDefault(); moveMonth(1); break;
      case "Home":       e.preventDefault(); setFocusedDay(1); break;
      case "End":        e.preventDefault(); setFocusedDay(daysInMonth); break;
      case "Enter":
      case " ":          e.preventDefault(); select(iso(viewYear, viewMonth, focusedDay)); break;
      case "Escape":     e.preventDefault(); setOpen(false); break;
    }
  }

  const selected = parseIso(value);
  const display = selected
    ? fmtDate.format(new Date(selected.y, selected.m, selected.d))
    : "";

  return (
    <div ref={rootRef} className="relative">
      <input
        type="hidden"
        name={props.name}
        value={value}
        required={props.required}
        aria-hidden="true"
      />
      <div className="flex items-center gap-1.5">
        <input
          id={props.id}
          type="text"
          inputMode="numeric"
          dir="ltr"
          value={value}
          disabled={props.disabled}
          placeholder={props.placeholder ?? "YYYY-MM-DD"}
          onChange={(e) => applyText(e.target.value)}
          className={`input ${props.className ?? ""}`.trim()}
          aria-label={props.placeholder ?? "YYYY-MM-DD"}
        />
        <button
          type="button"
          disabled={props.disabled}
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={display || props.placeholder || "Choose date"}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-ivory-200 bg-white text-slate-500 transition-colors hover:text-navy-900"
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
            <rect x="1.5" y="2.5" width="13" height="12" rx="2" />
            <path d="M1.5 6h13M5 1.5v2.5M11 1.5v2.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {open ? (
        <div
          role="dialog"
          aria-label={fmtMonth.format(new Date(viewYear, viewMonth, 1))}
          onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } }}
          className="absolute z-40 mt-2 w-72 rounded-2xl border border-ivory-200 bg-white p-3 shadow-[0_24px_48px_-24px_rgb(15_23_42/0.35)]"
        >
          <div className="flex items-center justify-between pb-2">
            <button
              type="button"
              onClick={() => (view === "days" ? moveMonth(-1) : view === "months" ? setViewYear((y) => y - 1) : setPivotYear((y) => y - 12))}
              className="rounded-lg px-2 py-1 text-slate-500 hover:bg-ivory-100"
              aria-label={view === "days" ? "Previous month" : view === "months" ? "Previous year" : "Earlier years"}
            >
              ‹
            </button>
            <button
              type="button"
              className="rounded-lg px-2 py-1 text-sm font-semibold text-navy-900 hover:bg-ivory-100"
              onClick={() => setView((v) => (v === "days" ? "months" : "years"))}
              aria-label={view === "days" ? "Choose month / year" : view === "months" ? "Choose year" : "Back to days"}
            >
              {view === "days"
                ? fmtMonth.format(new Date(viewYear, viewMonth, 1))
                : view === "months"
                  ? new Intl.NumberFormat(locale, { useGrouping: false }).format(viewYear)
                  : `${new Intl.NumberFormat(locale, { useGrouping: false }).format(yearRangeWindow(pivotYear).start)}–${new Intl.NumberFormat(locale, { useGrouping: false }).format(yearRangeWindow(pivotYear).end)}`}
            </button>
            <button
              type="button"
              onClick={() => (view === "days" ? moveMonth(1) : view === "months" ? setViewYear((y) => y + 1) : setPivotYear((y) => y + 12))}
              className="rounded-lg px-2 py-1 text-slate-500 hover:bg-ivory-100"
              aria-label={view === "days" ? "Next month" : view === "months" ? "Next year" : "Later years"}
            >
              ›
            </button>
          </div>
          {view === "days" ? (
          <div role="grid" ref={gridRef} onKeyDown={onGridKeyDown}>
            <div role="row" className="grid grid-cols-7 text-center text-[11px] font-medium text-slate-400">
              {weekdayNames.map((w, i) => (
                <span role="columnheader" key={i} className="py-1">{w}</span>
              ))}
            </div>
            <div role="row" className="grid grid-cols-7 gap-y-0.5">
              {Array.from({ length: firstWeekday }).map((_, i) => (
                <span key={`pad-${i}`} aria-hidden="true" />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const cell = iso(viewYear, viewMonth, day);
                const isSel = value === cell;
                const isFocus = day === focusedDay;
                const isToday = today.y === viewYear && today.m === viewMonth && today.d === day;
                const disabled = !allowed(cell);
                return (
                  <button
                    key={day}
                    type="button"
                    tabIndex={isFocus ? 0 : -1}
                    disabled={disabled}
                    onClick={() => select(cell)}
                    onFocus={() => setFocusedDay(day)}
                    aria-pressed={isSel}
                    aria-label={fmtDate.format(new Date(viewYear, viewMonth, day))}
                    className={[
                      "mx-auto flex h-8 w-8 items-center justify-center rounded-lg text-sm transition-colors",
                      isSel
                        ? "bg-iris-600 font-semibold text-white"
                        : disabled
                          ? "cursor-not-allowed text-slate-300"
                          : "text-navy-900 hover:bg-ivory-100",
                      isFocus && !isSel ? "ring-1 ring-iris-300" : "",
                      isToday && !isSel ? "font-semibold text-iris-600" : "",
                    ].join(" ")}
                  >
                    {new Intl.NumberFormat(locale).format(day)}
                  </button>
                );
              })}
            </div>
          </div>
          ) : view === "months" ? (
            <div role="grid" aria-label="Choose month" className="grid grid-cols-3 gap-1 pb-2">
              {Array.from({ length: 12 }).map((_, m) => {
                const monthLabel = new Intl.DateTimeFormat(locale, { month: "short" }).format(new Date(viewYear, m, 1));
                const disabledCandidate = !allowed(iso(viewYear, m, 1)) && !allowed(iso(viewYear, m, new Date(viewYear, m + 1, 0).getDate()));
                const isCurrent = m === viewMonth;
                return (
                  <button
                    key={m}
                    type="button"
                    disabled={disabledCandidate}
                    onClick={() => {
                      const clamped = clampYearMonth(viewYear, m, props.min, props.max);
                      setViewYear(clamped.year);
                      setViewMonth(clamped.month);
                      setFocusedDay((d) => Math.min(d, new Date(clamped.year, clamped.month + 1, 0).getDate()));
                      setView("days");
                    }}
                    aria-pressed={isCurrent}
                    className={[
                      "rounded-lg px-2 py-2.5 text-sm transition-colors",
                      isCurrent ? "bg-iris-600 font-semibold text-white" : disabledCandidate ? "cursor-not-allowed text-slate-300" : "text-navy-900 hover:bg-ivory-100",
                    ].join(" ")}
                  >
                    {monthLabel}
                  </button>
                );
              })}
            </div>
          ) : (
            <div role="grid" aria-label="Choose year" className="grid grid-cols-3 gap-1 pb-2">
              {Array.from({ length: 12 }).map((_, i) => {
                const y = yearRangeWindow(pivotYear).start + i;
                const disabledCandidate = !allowed(`${y}-01-01`) && !allowed(`${y}-12-31`);
                const isCurrent = y === viewYear;
                return (
                  <button
                    key={y}
                    type="button"
                    disabled={disabledCandidate}
                    onClick={() => {
                      const clamped = clampYearMonth(y, Math.min(viewMonth, 11), props.min, props.max);
                      setViewYear(clamped.year);
                      setViewMonth(clamped.month);
                      setPivotYear(clamped.year);
                      setView("months");
                    }}
                    aria-pressed={isCurrent}
                    className={[
                      "rounded-lg px-2 py-2.5 text-sm tabular-nums transition-colors",
                      isCurrent ? "bg-iris-600 font-semibold text-white" : disabledCandidate ? "cursor-not-allowed text-slate-300" : "text-navy-900 hover:bg-ivory-100",
                    ].join(" ")}
                  >
                    {new Intl.NumberFormat(locale, { useGrouping: false }).format(y)}
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex items-center justify-between border-t border-ivory-100 pt-2">
            <button
              type="button"
              className="text-xs font-medium text-iris-600 hover:underline"
              onClick={() => {
                const v = iso(today.y, today.m, today.d);
                if (allowed(v)) { setViewYear(today.y); setViewMonth(today.m); select(v); }
              }}
            >
              {locale === "fr" ? "Aujourd'hui" : locale === "ar" ? "اليوم" : "Today"}
            </button>
            <button
              type="button"
              className="text-xs font-medium text-slate-400 hover:underline"
              disabled={props.required}
              onClick={() => { if (!props.required) { setValue(""); setOpen(false); } }}
            >
              {locale === "fr" ? "Effacer" : locale === "ar" ? "مسح" : "Clear"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
