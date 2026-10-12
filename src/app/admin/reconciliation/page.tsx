import Link from "next/link";
import { notFound } from "next/navigation";
import { pageUser } from "@/lib/page-auth";
import { pool } from "@/lib/db";
import { getUiLocale } from "@/lib/ui-i18n";
import { flashFrom } from "@/lib/action-helpers";
import { createLegacyReconciliationService } from "@/lib/legacy-reconciliation";
import { scanReconciliationAction,recordReconciliationAction } from "@/app/actions/reconciliation";
import { AuditTime } from "@/components/audit-time";
import { Flash,PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/forms";
export const dynamic="force-dynamic";
const words={en:{title:"Legacy reconciliation",intro:"History remains readable. Owner notes do not restore missing originals. Restoration is accepted only after the genuine persisted document and storage bytes have been verified.",scan:"Scan current records",empty:"No findings recorded. Run a scan before acceptance.",open:"Reconciliation required",restored:"Restored",decision:"Missing official decision",storage:"Missing storage object",note:"Owner or recovery note",record:"Record unresolved note",verify:"Verify restored originals",dossier:"Open dossier",provider:"Storage inventory is unavailable for this provider. Reconciliation is blocked."},fr:{title:"Régularisation des anciens dossiers",intro:"L'historique reste consultable. Les notes ne remplacent pas les originaux manquants. La restauration exige la vérification du document authentique enregistré et de ses données.",scan:"Analyser les dossiers",empty:"Aucun constat enregistré. Effectuez une analyse avant validation.",open:"Régularisation requise",restored:"Restauré",decision:"Décision officielle manquante",storage:"Fichier stocké manquant",note:"Note du propriétaire ou de récupération",record:"Enregistrer une note non résolue",verify:"Vérifier les originaux restaurés",dossier:"Ouvrir le dossier",provider:"L'inventaire du stockage est indisponible. La régularisation est bloquée."},ar:{title:"تسوية الملفات القديمة",intro:"يبقى السجل قابلاً للقراءة. لا تستعيد ملاحظات المالك الأصول المفقودة. تتطلب الاستعادة التحقق من الوثيقة الأصلية المحفوظة وبياناتها.",scan:"فحص الملفات الحالية",empty:"لا توجد نتائج مسجلة. قم بالفحص قبل الاعتماد.",open:"تسوية مطلوبة",restored:"تمت الاستعادة",decision:"قرار رسمي مفقود",storage:"ملف مخزن مفقود",note:"ملاحظة المالك أو الاستعادة",record:"تسجيل ملاحظة غير محلولة",verify:"التحقق من الأصول المستعادة",dossier:"فتح الملف",provider:"جرد التخزين غير متاح. التسوية متوقفة."}};
export default async function ReconciliationPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const user=await pageUser();if(user.agencyId||!["SUPER_ADMIN","ADMIN"].includes(user.role))notFound();
  const locale=await getUiLocale(),w=words[locale],sp=await searchParams;
  const supported=!process.env.STORAGE_PROVIDER||process.env.STORAGE_PROVIDER==="db";
  const issues=supported?await createLegacyReconciliationService(pool).list(user):[];
  return <><PageHeader title={w.title} subtitle={w.intro}/><Flash {...flashFrom(sp)}/>
    {supported?<form action={scanReconciliationAction}><SubmitButton className="btn-secondary">{w.scan}</SubmitButton></form>:<p role="alert">{w.provider}</p>}
    <div className="mt-6 space-y-4">{supported&&!issues.length?<p className="card p-6">{w.empty}</p>:null}
    {issues.map(i=><section key={i.id} className="card p-6"><div className="flex flex-wrap justify-between gap-4"><h2 className="font-medium">{i.kind==="MISSING_OFFICIAL_DECISION"?w.decision:w.storage}</h2><span>{i.status==="OPEN"?w.open:w.restored}</span></div>
      <Link href={`/admin/applications/${i.applicationId}`} className="my-2 block underline"><bdi dir="ltr">{i.reference}</bdi> · {w.dossier}</Link>
      <AuditTime iso={i.detectedAt.toISOString()} locale={locale}/>{i.storageKey?<p className="mt-2 break-all font-mono text-xs" dir="ltr">{i.storageKey}</p>:null}<p className="my-4 break-words text-sm">{i.note}</p>
      <form action={recordReconciliationAction} className="space-y-4"><input type="hidden" name="issueId" value={i.id}/><label htmlFor={`note-${i.id}`} className="label">{w.note}</label><textarea id={`note-${i.id}`} name="note" required minLength={10} maxLength={2000} className="input"/>
        <div className="flex flex-wrap gap-2"><button name="outcome" value="OWNER_DISPOSITION" className="btn-secondary">{w.record}</button><button name="outcome" value="RESTORED" className="btn-secondary">{w.verify}</button></div></form>
    </section>)}</div></>;
}
