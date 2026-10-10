import { getUiLocale } from "@/lib/ui-i18n";
import { contentT } from "@/lib/i18n-content";
export default async function Loading() {
  const locale=await getUiLocale();
  return <div role="status" aria-live="polite" aria-busy="true" className="mx-auto max-w-6xl px-6 py-8"><p className="text-sm text-slate-600">{contentT(locale)("Loading your workspace…")}</p><div aria-hidden="true" className="mt-6 space-y-4"><div className="h-6 w-1/2 bg-slate-100"/><div className="h-4 w-3/4 bg-slate-100"/><div className="h-4 w-2/3 bg-slate-100"/></div></div>;
}
