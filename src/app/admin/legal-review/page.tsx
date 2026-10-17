import Link from "next/link";
import { notFound } from "next/navigation";
import { pageUser } from "@/lib/page-auth";
import { hasPermission } from "@/lib/rbac";
import { getUiLocale } from "@/lib/ui-i18n";
import { readPrivateLegalReviewPack } from "@/lib/legal-review";
import { legalReviewEnabled, reviewDocument, reviewPackReadiness, REVIEW_DOCUMENT_SECTIONS, type ReviewDocument } from "@/lib/legal-review-pack";

export const dynamic="force-dynamic";
export const metadata={robots:{index:false,follow:false},title:"Legal review — ESSAFARIA"};
const copy={
  fr:{title:"Revue juridique privée",warning:"Brouillon non approuvé. Revue par un juriste et date d’effet requises avant publication ou acceptation.",missing:"Le pack de revue privé n’est pas configuré.",version:"Version envisagée",reservations:"Clauses avec réserves",source:"Empreinte du document source",digest:"Empreinte du texte affiché"},
  en:{title:"Private legal review",warning:"Unapproved draft. Counsel review and an effective date are required before publication or acceptance.",missing:"The private review pack is not configured.",version:"Proposed version",reservations:"Clauses with reservations",source:"Source document digest",digest:"Displayed content digest"},
  ar:{title:"المراجعة القانونية الخاصة",warning:"مسودة غير معتمدة. يلزم اعتماد المستشار القانوني وتحديد تاريخ السريان قبل النشر أو الإقرار.",missing:"لم يتم إعداد حزمة المراجعة الخاصة.",version:"الإصدار المقترح",reservations:"البنود التي تتضمن تحفظات",source:"بصمة الوثيقة المصدر",digest:"بصمة النص المعروض"},
};
export default async function LegalReviewPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  if(!legalReviewEnabled())notFound();
  const actor=await pageUser();if(actor.role!=="SUPER_ADMIN"||actor.agencyId||!hasPermission(actor,"cms.manage"))notFound();
  const sp=await searchParams,locale=await getUiLocale(sp),ct=copy[locale],pack=await readPrivateLegalReviewPack();
  if(!pack)return <section lang={locale} dir={locale==="ar"?"rtl":"ltr"}><h1 className="text-2xl font-semibold text-navy-900">{ct.title}</h1><p role="status" className="mt-4 text-base text-slate-700">{ct.missing}</p></section>;
  const kind=typeof sp.document==="string"&&Object.hasOwn(REVIEW_DOCUMENT_SECTIONS,sp.document)?sp.document as ReviewDocument:"legal_notice";
  const document=reviewDocument(pack,kind,locale),readiness=reviewPackReadiness(pack);
  return <section lang={locale} dir={document.direction} className="max-w-3xl">
    <h1 className="text-2xl font-semibold text-navy-900">{ct.title}</h1>
    <p role="status" className="mt-4 border-y border-line py-4 text-base font-semibold text-slate-700">{ct.warning}</p>
    <nav aria-label={ct.title} className="mt-6 flex flex-wrap gap-x-6 gap-y-3">{(["fr","en","ar"] as const).map(lang=><Link key={lang} lang={lang} aria-current={lang===locale?"page":undefined} className="text-base underline underline-offset-4" href={`?lang=${lang}&document=${kind}`}>{lang.toUpperCase()}</Link>)}</nav>
    <nav aria-label={pack.locales[locale].title} className="mt-6 space-y-2">{(Object.keys(REVIEW_DOCUMENT_SECTIONS) as ReviewDocument[]).map(id=><Link key={id} className="block text-base underline underline-offset-4" aria-current={kind===id?"page":undefined} href={`?lang=${locale}&document=${id}`}>{pack.locales[locale].sections.find(s=>s.id===REVIEW_DOCUMENT_SECTIONS[id])!.title}</Link>)}</nav>
    <p className="mt-6 text-base text-slate-600">{ct.version}: <bdi dir="ltr">{pack.version}</bdi> · {ct.reservations}: {readiness.unresolvedClauses.length}</p>
    {document.sections.map(section=><article key={section.id} className="mt-8 border-t border-line pt-6"><h2 className="text-xl font-semibold text-navy-900">{section.title}</h2>{section.clauses.map(clause=><section key={clause.id} className="mt-6"><h3 className="text-base font-semibold text-navy-900"><bdi dir="ltr">{clause.id}</bdi> {clause.title}</h3><p className="mt-2 whitespace-pre-line text-base leading-relaxed text-slate-700" style={{unicodeBidi:"plaintext"}}>{clause.body}</p></section>)}</article>)}
    <dl className="mt-8 space-y-3 border-t border-line pt-6 text-sm text-slate-600"><div><dt>{ct.source}</dt><dd className="break-all"><bdi dir="ltr">{pack.locales[locale].sourceSha256}</bdi></dd></div><div><dt>{ct.digest}</dt><dd className="break-all"><bdi dir="ltr">{document.contentSha256}</bdi></dd></div></dl>
  </section>;
}
