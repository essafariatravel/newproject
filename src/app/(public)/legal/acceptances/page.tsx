import { pageUser } from "@/lib/page-auth";
import { getUiLocale } from "@/lib/ui-i18n";
import { readPublishedLegal, type LegalKind } from "@/lib/legal";
import { legalContentSha256, type LegalAcceptanceType } from "@/lib/legal-evidence";
import { acceptLegalAction } from "@/app/actions/legal-acceptance";
import { pool } from "@/lib/db";
import { qualifiedTable } from "@/lib/database-schema";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };
const copy = {
  fr: { title: "Documents applicables à votre compte", missing: "Aucune version approuvée n’est disponible pour ce document. Aucune acceptation n’est demandée.", accept: "J’ai lu et j’accepte ce texte.", acknowledge: "J’ai pris connaissance de cette information de confidentialité.", save: "Enregistrer mon choix", saved: "Votre choix a été enregistré.", changed: "Le texte a changé. Relisez la version actuelle avant de confirmer.", unavailable: "Votre choix n’a pas été enregistré. Veuillez réessayer.", terms: "Conditions d’utilisation B2B", privacy: "Confidentialité", commercial: "Conditions commerciales B2B", staff: "Confidentialité du personnel" },
  en: { title: "Documents applicable to your account", missing: "No approved version is available for this document. No acceptance is requested.", accept: "I have read and accept this text.", acknowledge: "I have read this privacy information.", save: "Record my choice", saved: "Your choice has been recorded.", changed: "The text has changed. Read the current version before confirming.", unavailable: "Your choice was not recorded. Please try again.", terms: "B2B terms of use", privacy: "Privacy notice", commercial: "B2B commercial terms", staff: "Staff confidentiality" },
  ar: { title: "الوثائق المنطبقة على حسابك", missing: "لا توجد نسخة معتمدة لهذه الوثيقة. لا يُطلب أي قبول.", accept: "قرأت هذا النص وأوافق عليه.", acknowledge: "اطلعت على معلومات الخصوصية هذه.", save: "تسجيل اختياري", saved: "تم تسجيل اختيارك.", changed: "تغير النص. اقرأ النسخة الحالية قبل التأكيد.", unavailable: "لم يتم تسجيل اختيارك. يرجى المحاولة مجدداً.", terms: "شروط الاستخدام بين المهنيين", privacy: "إشعار الخصوصية", commercial: "الشروط التجارية بين المهنيين", staff: "سرية الموظفين" },
};
export default async function LegalAcceptancesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await pageUser(), sp = await searchParams, locale = await getUiLocale(sp), ct = copy[locale];
  const applicable: Array<{ type: LegalAcceptanceType; kind: LegalKind; title: string }> = [{ type: "privacy_b2b", kind: "privacy", title: ct.privacy }];
  if (actor.agencyId) {
    applicable.push({ type: "terms_b2b", kind: "terms", title: ct.terms });
    if (actor.role === "AGENCY_ADMIN") applicable.push({ type: "commercial_b2b", kind: "commercial", title: ct.commercial });
  } else applicable.push({ type: "staff_confidentiality", kind: "staff_confidentiality", title: ct.staff });
  const documents = await Promise.all(applicable.map(async item => ({ ...item, legal: await readPublishedLegal(item.kind, locale) })));
  const ready = Boolean((await pool.query("select to_regclass($1) relation", [qualifiedTable("legal_acceptances")])).rows[0]?.relation);
  const receipts = ready ? (await pool.query<{ legal_version_id: string; accepted_at: Date }>(`select legal_version_id,accepted_at from ${qualifiedTable("legal_acceptances")} where user_id=$1`, [actor.id])).rows : [];
  const recorded = documents.some(item => receipts.some(receipt => receipt.legal_version_id === item.legal?.id));
  return <section lang={locale} dir={locale === "ar" ? "rtl" : "ltr"} className="ess-container max-w-3xl py-8">
    <h1 className="font-serif text-[32px] text-navy-900">{ct.title}</h1>
    {sp.result ? <p role="status" className="mt-4 text-base font-semibold">{sp.result === "saved" && recorded ? ct.saved : sp.result === "changed" ? ct.changed : ct.unavailable}</p> : null}
    {documents.map(item => <article key={item.type} className="mt-8 border-t border-line pt-6"><h2 className="text-xl font-semibold text-navy-900">{item.title}</h2>{item.legal && ready ? <>
      <p className="mt-2 text-sm text-slate-600"><bdi dir="ltr">v{item.legal.version} · {item.legal.effectiveAt.toISOString().slice(0, 10)}</bdi></p>
      <div className="mt-4 whitespace-pre-line text-base leading-relaxed text-slate-700" style={{ unicodeBidi: "plaintext" }}>{item.legal.body}</div>
      {receipts.some(receipt => receipt.legal_version_id === item.legal!.id) ? <p role="status" className="mt-6 text-base font-semibold">{ct.saved}</p> : <form action={acceptLegalAction} className="mt-6 space-y-4">
        <input type="hidden" name="documentType" value={item.type} /><input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="legalVersionId" value={item.legal.id} /><input type="hidden" name="contentSha256" value={legalContentSha256(item.legal.body)} />
        <label className="flex min-h-11 items-center gap-3 text-base"><input type="checkbox" name="explicit" required />{item.type === "privacy_b2b" ? ct.acknowledge : ct.accept}</label>
        <button type="submit" className="btn-primary">{ct.save}</button>
      </form>}
    </> : <p role="status" className="mt-4 text-base text-slate-600">{ct.missing}</p>}</article>)}
  </section>;
}
