import Link from "next/link";
import { getUiLocale } from "@/lib/ui-i18n";
import { publicBrandCopy } from "@/lib/public-brand-copy";
import { getSiteSettings, settingString } from "@/lib/settings";
export const dynamic = "force-dynamic";
export default async function AboutPage() {
  const locale = await getUiLocale();
  const copy = publicBrandCopy(locale);
  const ownerCopy = settingString(await getSiteSettings(), `public.about.${locale}`).trim();
  return <section className="ess-container max-w-4xl py-16 sm:py-24"><p className="travel-eyebrow text-gold-700">ESSAFARIA</p><h1 className="mt-4 max-w-2xl font-serif text-4xl leading-tight text-navy-900 sm:text-5xl">{copy.aboutTitle}</h1><p className="mt-6 max-w-2xl whitespace-pre-line text-lg leading-relaxed text-slate-600">{ownerCopy || copy.aboutBody}</p><Link href="/agency/register" className="btn-primary mt-8">{copy.partner}</Link></section>;
}
