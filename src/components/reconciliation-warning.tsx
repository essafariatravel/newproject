import { pool } from "@/lib/db";
import { qualifiedTable } from "@/lib/database-schema";
import { assertApplicationAccess } from "@/lib/documents";
import type { AuthUser } from "@/lib/types";
import Link from "next/link";
import { officialDocumentIntegritySql } from "@/lib/decision-integrity";

const copy = {
  en: "This historical file requires reconciliation. Missing original documents cannot prove a complete valid dossier. Contact ESSAFARIA to recover the genuine originals.",
  fr: "Ce dossier historique doit être régularisé. Les documents originaux manquants ne permettent pas de prouver sa conformité. Contactez ESSAFARIA pour récupérer les originaux authentiques.",
  ar: "يحتاج هذا الملف التاريخي إلى تسوية. لا تثبت الوثائق الأصلية المفقودة اكتمال الملف وصحته. تواصل مع ESSAFARIA لاستعادة الأصول الحقيقية.",
};

export async function ReconciliationWarning({ applicationId, user, locale }: { applicationId: string; user: AuthUser; locale: "en"|"fr"|"ar" }) {
  const access = await assertApplicationAccess(applicationId,user);
  if (process.env.STORAGE_PROVIDER && process.env.STORAGE_PROVIDER !== "db") return <aside role="status" className="my-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" data-testid="reconciliation-unverified">
    {{en:"The integrity of stored originals has not been verified. Contact ESSAFARIA before treating this dossier as complete.",fr:"L’intégrité des originaux stockés n’a pas été vérifiée. Contactez ESSAFARIA avant de considérer ce dossier comme complet.",ar:"لم يتم التحقق من سلامة الأصول المخزنة. تواصل مع ESSAFARIA قبل اعتبار هذا الملف مكتملًا."}[locale]}
  </aside>;
  const t=qualifiedTable;
  const result=(await pool.query<{ unhealthy:boolean }>(`select
    exists(select 1 from ${t("documents")} d left join ${t("document_blobs")} b on b.key=d.storage_key
      where d.application_id=$1 and (b.key is null or b.size_bytes<>d.size_bytes or octet_length(b.data)<>d.size_bytes or b.mime_type<>d.mime_type))
    or exists(select 1 from ${t("applications")} a join ${t("statuses")} s on s.id=a.status_id where a.id=$1 and s.code in ('APPROVED','REJECTED')
      and (a.decision_at is null or not exists(select 1 from ${t("documents")} d join ${t("document_types")} dt on dt.id=d.document_type_id
        join ${t("document_blobs")} b on b.key=d.storage_key where d.application_id=a.id and dt.code=case when s.code='APPROVED' then 'DECISION_VISA_APPROVAL' else 'DECISION_REFUSAL_LETTER' end
        and ${officialDocumentIntegritySql("d", "b")}))) unhealthy`,[access.applicationId])).rows[0];
  if (!result?.unhealthy) return null;
  return <aside role="status" className="my-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" data-testid="reconciliation-warning">
    <p>{copy[locale]}</p>{!user.agencyId && ["SUPER_ADMIN","ADMIN"].includes(user.role) ? <Link href="/admin/reconciliation" className="mt-2 inline-block underline">{ {en:"Review reconciliation",fr:"Examiner la régularisation",ar:"مراجعة التسوية"}[locale] }</Link> : null}
  </aside>;
}
