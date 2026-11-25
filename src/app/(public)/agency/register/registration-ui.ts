export const registrationSections = ["company", "contact", "consent"] as const;
export type RegistrationSection = (typeof registrationSections)[number];

export const registrationUi = {
  fr: {
    dossier: "Dossier partenaire", agency: "Votre agence", navigation: "Rubriques du formulaire",
    company: "Agence", contact: "Contact", consent: "Accords", required: "Champs obligatoires",
    receipt: "Accusé de réception", copy: "Copier la référence", copied: "Référence copiée.",
    copyManually: "La référence est sélectionnée. Utilisez la commande Copier de votre appareil.",
  },
  en: {
    dossier: "Partner application", agency: "Your agency", navigation: "Form sections",
    company: "Agency", contact: "Contact", consent: "Consent", required: "Required fields",
    receipt: "Acknowledgement", copy: "Copy reference", copied: "Reference copied.",
    copyManually: "The reference is selected. Use your device’s copy command.",
  },
  ar: {
    dossier: "ملف الشراكة", agency: "وكالتكم", navigation: "أقسام الاستمارة",
    company: "الوكالة", contact: "جهة الاتصال", consent: "الموافقات", required: "حقول إلزامية",
    receipt: "إشعار استلام", copy: "نسخ المرجع", copied: "تم نسخ المرجع.",
    copyManually: "تم تحديد المرجع. استخدموا أمر النسخ على جهازكم.",
  },
} as const;
