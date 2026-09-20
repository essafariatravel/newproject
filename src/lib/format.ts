export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatAmount(amount: string | number, currency: string): string {
  const n = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(n)) return `${amount} ${currency}`;
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
}

/** Zero denotes an unpublished processing estimate, never an immediate turnaround. */
export function formatProcessingDays(min: number, max: number): string {
  return min > 0 && max > 0 ? `${min}–${max} working days` : "On request";
}

export function titleize(code: string): string {
  return code
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function personName(p: { firstName: string; middleName?: string | null; lastName: string }) {
  return [p.firstName, p.middleName, p.lastName].filter(Boolean).join(" ");
}

export function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w.charAt(0))
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function bytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
