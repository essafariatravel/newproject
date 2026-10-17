import { notFound } from "next/navigation";
import { getUiLocale } from "@/lib/ui-i18n";
import { readPublishedLegal } from "@/lib/legal";
import { publicBrandCopy } from "@/lib/public-brand-copy";
import { formatDate } from "@/lib/format";
const documents={"legal-notice":{kind:"legal_notice",en:"Legal notice",fr:"Mentions légales",ar:"البيانات القانونية"},cookies:{kind:"cookies",en:"Cookie policy",fr:"Politique de cookies",ar:"سياسة ملفات الارتباط"},commercial:{kind:"commercial",en:"B2B commercial terms",fr:"Conditions commerciales B2B",ar:"الشروط التجارية بين المهنيين"}} as const;
export const dynamic="force-dynamic";
export const metadata={robots:{index:false,follow:false}};
export default async function LegalDocumentPage({params,searchParams}:{params:Promise<{document:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const {document}=await params;if(!Object.hasOwn(documents,document))notFound();
  const page=documents[document as keyof typeof documents],locale=await getUiLocale(await searchParams),legal=await readPublishedLegal(page.kind,locale);
  return <section lang={locale} dir={locale==="ar"?"rtl":"ltr"} className="ess-container max-w-3xl py-8"><h1 className="font-serif text-[32px] text-navy-900">{page[locale]}</h1>{legal?<><p className="mt-2 text-xs text-slate-500"><bdi dir="ltr">{legal.version}</bdi> · {formatDate(legal.effectiveAt,locale)}</p><div className="mt-8 whitespace-pre-line border-t border-line pt-6 text-base leading-relaxed text-slate-700" style={{unicodeBidi:"plaintext"}}>{legal.body}</div></>:<p role="status" className="mt-6 border-t border-line pt-6 text-base leading-relaxed text-slate-600">{publicBrandCopy(locale).legalMissing}</p>}</section>;
}
