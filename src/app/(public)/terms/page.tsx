import { readPublishedLegal } from "@/lib/legal";
import { getUiLocale } from "@/lib/ui-i18n";
import { formatDate } from "@/lib/format";
import { contentT } from "@/lib/i18n-content";
import { publicBrandCopy } from "@/lib/public-brand-copy";
export const dynamic = "force-dynamic";
export default async function TermsPage() {
  const locale = await getUiLocale();
  const ct = contentT(locale);
  const legal = await readPublishedLegal("terms",locale);
  return <section className="ess-container max-w-3xl py-14"><h1 className="font-serif text-3xl text-navy-900">{ct("Terms of Service")}</h1>{legal ? <><p className="mt-2 text-xs text-slate-500">{publicBrandCopy(locale).updated}: {formatDate(legal.publishedAt,locale)} · v{legal.version}</p><div className="mt-8 whitespace-pre-line border-t border-line pt-6 text-base leading-relaxed text-slate-700">{legal.body}</div></> : <p role="status" className="mt-6 border-t border-line pt-6 text-sm leading-relaxed text-slate-600">{publicBrandCopy(locale).legalMissing}</p>}</section>;
}
