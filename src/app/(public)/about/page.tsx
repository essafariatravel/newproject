import Link from "next/link";
import { getUiLocale } from "@/lib/ui-i18n";
import { publicBrandCopy } from "@/lib/public-brand-copy";
export const dynamic = "force-dynamic";
export default async function AboutPage() {
  const copy = publicBrandCopy(await getUiLocale());
  return <section className="ess-container max-w-4xl py-8 sm:py-8"><p className="travel-eyebrow text-gold-700">ESSAFARIA</p><h1 className="mt-4 max-w-2xl font-serif text-[32px] leading-tight text-navy-900 sm:text-[32px]">{copy.aboutTitle}</h1><p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-600">{copy.aboutBody}</p><Link href="/agency/register" className="btn-primary mt-8">{copy.partner}</Link></section>;
}
