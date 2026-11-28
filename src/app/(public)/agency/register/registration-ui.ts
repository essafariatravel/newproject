import type { RegistrationCopy, RegistrationLocale } from "@/lib/i18n";
import type { RegistrationProblem } from "@/lib/registration-contact";

export const registrationSections = ["company", "contact", "consent"] as const;
export type RegistrationSection = (typeof registrationSections)[number];

export const registrationUi = {
  fr: {
    dossier: "Dossier partenaire", agency: "Votre agence", navigation: "Rubriques du formulaire",
    company: "Agence", contact: "Contact", consent: "Vérification", required: "Champs obligatoires",
    givenName: "Prénom", familyName: "Nom de famille", dialCode: "Indicatif", nationalNumber: "Téléphone / WhatsApp",
    phoneHint: "Neuf chiffres après l’indicatif.", phoneCountry: "Choisissez l’indicatif du numéro saisi.",
    phoneLength: "Saisissez les neuf chiffres après l’indicatif.", invalidPhone: "Ce numéro ne correspond pas au plan téléphonique du pays choisi.",
    emailHint: "Utilisez l’adresse de l’agence où nous pouvons vous joindre.", emailValid: "Format de l’adresse correct.",
    emailSuggestion: "Utiliser cette adresse", next: "Continuer", back: "Retour", edit: "Modifier", review: "Vérifier votre demande",
    reviewHint: "Relisez les coordonnées avant de confirmer les accords et d’envoyer la demande.",
    receipt: "Accusé de réception", copy: "Copier la référence", copying: "Copie en cours…", copied: "Référence copiée.",
    copyManually: "La référence est sélectionnée. Utilisez la commande Copier de votre appareil.",
  },
  en: {
    dossier: "Partner application", agency: "Your agency", navigation: "Form sections",
    company: "Agency", contact: "Contact", consent: "Review", required: "Required fields",
    givenName: "Given name", familyName: "Family name", dialCode: "Country code", nationalNumber: "Phone / WhatsApp",
    phoneHint: "Nine digits after the country code.", phoneCountry: "Choose the country code for this number.",
    phoneLength: "Enter the nine digits after the country code.", invalidPhone: "This number does not match the selected country’s numbering plan.",
    emailHint: "Use the agency email address where we can reach you.", emailValid: "Email format is correct.",
    emailSuggestion: "Use this address", next: "Continue", back: "Back", edit: "Edit", review: "Review your application",
    reviewHint: "Check these details before accepting the agreements and sending your application.",
    receipt: "Acknowledgement", copy: "Copy reference", copying: "Copying…", copied: "Reference copied.",
    copyManually: "The reference is selected. Use your device’s copy command.",
  },
  ar: {
    dossier: "ملف الشراكة", agency: "وكالتكم", navigation: "أقسام الاستمارة",
    company: "الوكالة", contact: "جهة الاتصال", consent: "المراجعة", required: "حقول إلزامية",
    givenName: "الاسم الشخصي", familyName: "اسم العائلة", dialCode: "رمز الدولة", nationalNumber: "الهاتف / واتساب",
    phoneHint: "تسعة أرقام بعد رمز الدولة.", phoneCountry: "اختاروا رمز الدولة المطابق لهذا الرقم.",
    phoneLength: "أدخلوا الأرقام التسعة بعد رمز الدولة.", invalidPhone: "هذا الرقم لا يتوافق مع خطة الترقيم للدولة المختارة.",
    emailHint: "استخدموا البريد الإلكتروني للوكالة الذي يمكننا التواصل معكم عبره.", emailValid: "صيغة البريد الإلكتروني صحيحة.",
    emailSuggestion: "استخدام هذا العنوان", next: "متابعة", back: "رجوع", edit: "تعديل", review: "راجعوا طلبكم",
    reviewHint: "راجعوا بيانات الاتصال قبل تأكيد الموافقات وإرسال الطلب.",
    receipt: "إشعار استلام", copy: "نسخ المرجع", copying: "جارٍ النسخ…", copied: "تم نسخ المرجع.",
    copyManually: "تم تحديد المرجع. استخدموا أمر النسخ على جهازكم.",
  },
} as const;

export function registrationProblemText(locale: RegistrationLocale, errors: RegistrationCopy["errors"], problem: RegistrationProblem) {
  if (problem === "phoneCountry" || problem === "phoneLength" || problem === "invalidPhone") return registrationUi[locale][problem];
  return errors[problem];
}
