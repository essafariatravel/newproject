import Link from "next/link";
import type { Metadata } from "next";
import { getUiLocale } from "@/lib/ui-i18n";
import { publicBrandCopy } from "@/lib/public-brand-copy";
import { buildPublicMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return buildPublicMetadata("b2b", await getUiLocale());
}
export default async function B2BPage() {
  const copy = publicBrandCopy(await getUiLocale());
  return <section className="ess-container public-reading public-partnership">
    <div><h1 className="mt-4 font-serif text-[32px] leading-tight text-navy-900 sm:text-[32px]">{copy.agenciesTitle}</h1><p className="mt-6 max-w-lg text-lg leading-relaxed text-slate-600">{copy.agenciesBody}</p><div id="partner" className="mt-8 border-t border-line pt-6"><h2 className="font-serif text-2xl text-navy-900">{copy.applyTitle}</h2><p className="mt-4 max-w-lg text-base leading-relaxed text-slate-600">{copy.applyBody}</p><Link href="/agency/register" className="btn-primary mt-6">{copy.partner}</Link><p className="mt-4 text-xs text-slate-500">{copy.review}</p></div></div>
    <figure><img src="/images/departure-atelier.webp" alt="" width="1536" height="1024" className="aspect-[4/5] w-full object-cover" /><figcaption className="mt-2 text-xs text-slate-500">{copy.illustration}</figcaption></figure>
  </section>;
}
