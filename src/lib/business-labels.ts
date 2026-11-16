import type { UiLocale } from "@/lib/ui-i18n";

const labels: Record<string, [string, string, string]> = {
  APPLICATION_DECISION_RECORDED: ["Decision recorded", "Décision enregistrée", "تم تسجيل القرار"],
  DOCUMENT_REPLACEMENT_REQUESTED: ["Replacement requested", "Remplacement demandé", "طُلب مستند بديل"],
  DOCUMENT_ADDITIONAL_REQUESTED: ["Additional document requested", "Document complémentaire demandé", "طُلب مستند إضافي"],
  DOCUMENT_UPLOADED: ["Document received", "Document reçu", "تم استلام المستند"],
  DOCUMENT_DOWNLOADED: ["Document downloaded", "Document téléchargé", "تم تنزيل المستند"],
  DOCUMENT_RESUBMITTED: ["Document replaced", "Document remplacé", "تم استبدال المستند"],
  DOCUMENT_DELETED: ["Document removed", "Document supprimé", "تم حذف المستند"],
  WALLET_CREDIT: ["Wallet credited", "Portefeuille crédité", "تم إيداع رصيد بالمحفظة"],
  WALLET_DEBIT: ["Wallet debited", "Portefeuille débité", "تم الخصم من المحفظة"],
  WALLET_TOPUP_REQUESTED: ["Top-up requested", "Approvisionnement demandé", "طُلبت تعبئة المحفظة"],
  WALLET_TOPUP_REJECTED: ["Top-up declined", "Approvisionnement refusé", "رُفض طلب التعبئة"],
  USER_LOGIN: ["Signed in", "Connexion", "تسجيل الدخول"],
  PASSWORD_CHANGED: ["Password changed", "Mot de passe modifié", "تم تغيير كلمة المرور"],
  USER_CREATED: ["User created", "Utilisateur créé", "تم إنشاء المستخدم"],
  USER_UPDATED: ["User updated", "Utilisateur mis à jour", "تم تحديث المستخدم"],
  AGENCY_CREATED: ["Agency created", "Agence créée", "تم إنشاء الوكالة"],
  AGENCY_UPDATED: ["Agency updated", "Agence mise à jour", "تم تحديث الوكالة"],
  PRICE_ADJUSTED: ["Price adjusted", "Tarif ajusté", "تمت تسوية السعر"],
  SETTINGS_UPDATED: ["Settings updated", "Paramètres mis à jour", "تم تحديث الإعدادات"],
  APPLICATION_PRIORITY_CHANGED: ["Priority changed", "Priorité modifiée", "تم تغيير الأولوية"],
  APPLICATION_NOTES_UPDATED: ["Internal notes updated", "Notes internes mises à jour", "تم تحديث الملاحظات الداخلية"],
  REPORTS_EXPORTED: ["Reports exported", "Rapports exportés", "تم تصدير التقارير"],
  APPLICATIONS_EXPORTED: ["Applications exported", "Dossiers exportés", "تم تصدير الطلبات"],
  ACTIVE: ["Active", "Actif", "نشط"],
  SUSPENDED: ["Suspended", "Suspendu", "موقوف"],

  SUPER_ADMIN: ["Super administrator", "Super administrateur", "المسؤول الرئيسي"],
  ADMIN: ["Staff", "Personnel", "الموظفون"],
  VISA_AGENT: ["Staff", "Personnel", "الموظفون"],
  ACCOUNTING: ["Staff", "Personnel", "الموظفون"],
  AGENCY_ADMIN: ["Agency administrator", "Administrateur agence", "مسؤول الوكالة"],
  AGENCY_USER: ["Agency member", "Membre de l’agence", "عضو الوكالة"],
  CREDIT: ["Wallet credit", "Crédit portefeuille", "إيداع في المحفظة"],
  DEBIT: ["Manual debit", "Débit manuel", "خصم يدوي"],
  APPLICATION_CHARGE: ["Application fee", "Frais de dossier", "رسوم الطلب"],
  COMMERCIAL_DISCOUNT: ["Discount / refund", "Remise / remboursement", "خصم / استرداد"],
  COMMERCIAL_SURCHARGE: ["Additional fee", "Frais supplémentaires", "رسوم إضافية"],
  APPLICATION_SUBMITTED: ["Application submitted", "Demande soumise", "تم إرسال الطلب"],
  APPLICATION_CREATED: ["Application created", "Demande créée", "تم إنشاء الطلب"],
  APPLICATION_ASSIGNED: ["Application assigned", "Demande attribuée", "تم إسناد الطلب"],
  STATUS_CHANGED: ["Application updated", "Demande mise à jour", "تم تحديث الطلب"],
  DOCUMENT_REQUESTED: ["Document requested", "Document demandé", "مستند مطلوب"],
  DOCUMENTS_REQUIRED: ["Documents updated", "Documents mis à jour", "تم تحديث المستندات"],
  DOCUMENT_REJECTED: ["Document needs attention", "Document à vérifier", "مستند يتطلب إجراء"],
  RESUBMISSION_REQUIRED: ["Replacement requested", "Remplacement demandé", "مطلوب مستند بديل"],
  DOCUMENT_ACCEPTED: ["Document accepted", "Document accepté", "تم قبول المستند"],
  DOCUMENT_REQUEST_FULFILLED: ["Requested document received", "Document demandé reçu", "تم استلام المستند المطلوب"],
  APPLICATION_COMPLETED: ["Application completed", "Demande terminée", "اكتمل الطلب"],
  APPLICATION_DECISION: ["Decision available", "Décision disponible", "القرار متاح"],
  MESSAGE_POSTED: ["New message", "Nouveau message", "رسالة جديدة"],
  WALLET_ADJUSTED: ["Wallet updated", "Portefeuille mis à jour", "تم تحديث المحفظة"],
  TOPUP_REQUESTED: ["Top-up requested", "Approvisionnement demandé", "طلب تعبئة المحفظة"],
  WALLET_TOPUP_DECIDED: ["Top-up request updated", "Approvisionnement mis à jour", "تم تحديث طلب التعبئة"],
  REGISTRATION_SUBMITTED: ["Registration submitted", "Inscription soumise", "تم إرسال التسجيل"],
  REGISTRATION_APPROVED: ["Registration approved", "Inscription approuvée", "تم قبول التسجيل"],
  REGISTRATION_REJECTED: ["Registration declined", "Inscription refusée", "تم رفض التسجيل"],
  AGENCY_ONBOARDED: ["Agency account ready", "Compte agence prêt", "حساب الوكالة جاهز"],
};

export function businessLabel(code: string, locale: UiLocale, fallback?: string): string {
  const index = locale === "fr" ? 1 : locale === "ar" ? 2 : 0;
  if (code.startsWith("CONFIG_")) {
    const verb = code.split("_").at(-1)!;
    const verbs: Record<string, string[]> = { CREATED: ["created", "créée", "تم إنشاؤه"], UPDATED: ["updated", "modifiée", "تم تحديثه"], TOGGLED: ["availability changed", "disponibilité modifiée", "تم تغيير توفره"], DELETED: ["deleted", "supprimée", "تم حذفه"], ADDED: ["added", "ajoutée", "تمت إضافته"], REMOVED: ["removed", "retirée", "تمت إزالته"], SAVED: ["saved", "enregistrée", "تم حفظه"] };
    return `${["Configuration", "Configuration", "الإعداد"][index]} · ${verbs[verb]?.[index] ?? ["updated", "modifiée", "تم تحديثه"][index]}`;
  }
  return labels[code]?.[index]
    ?? fallback ?? { en: "Activity update", fr: "Mise à jour", ar: "تحديث النشاط" }[locale];
}

/** Translate only the exact generated charge description; preserve staff notes. */
export function businessReason(reason: string, type: string, reference: string | null | undefined, locale: UiLocale): string {
  if (type === "APPLICATION_CHARGE" && reference && reason === `Visa application ${reference}`) {
    return `${businessLabel("APPLICATION_CHARGE", locale)} · ${reference}`;
  }
  return reason;
}

export function notificationCategory(type: string): "action" | "messages" | "wallet" | "applications" {
  if (["DOCUMENT_REQUESTED", "DOCUMENT_REJECTED", "RESUBMISSION_REQUIRED"].includes(type)) return "action";
  if (type === "MESSAGE_POSTED") return "messages";
  if (type.includes("WALLET") || type === "TOPUP_REQUESTED") return "wallet";
  return "applications";
}
