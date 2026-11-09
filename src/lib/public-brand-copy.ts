import type { UiLocale } from "@/lib/ui-i18n";

const copies = {
  en: {
    eyebrow: "For travel agencies",
    hero: "The B2B visa platform for travel agencies.",
    intro: "For travel agencies in Algeria: open a traveller’s file, send documents for review and track the application from your agency workspace.",
    partner: "Become a partner",
    signIn: "Agency sign in",
    illustration: "Travel illustration",
    agenciesTitle: "A visa desk for your agency.",
    agenciesBody: "ESSAFARIA supports partner travel agencies in Algeria with each traveller’s visa request. Prepare the file, share the required documents and follow the case in your secure workspace.",
    applyTitle: "Request partner access",
    applyBody: "Tell us your agency name and how to reach you. Our team reviews your request and contacts you if further information is needed.",
    review: "Agency access follows review.",
    aboutTitle: "About ESSAFARIA Travel",
    aboutBody: "Based in Algiers, ESSAFARIA TRAVEL supports travel agencies with their travellers’ visa applications through a professional B2B service.",
    legalMissing: "This information is awaiting publication. Please contact ESSAFARIA for the approved document before accepting it.",
    updated: "Effective date",
  },
  fr: {
    eyebrow: "Pour les agences de voyages",
    hero: "La plateforme visa B2B des agences de voyages.",
    intro: "Pour les agences de voyages en Algérie : ouvrez le dossier d’un voyageur, transmettez ses pièces et suivez sa demande depuis votre espace agence.",
    partner: "Devenir partenaire",
    signIn: "Connexion agence",
    illustration: "Illustration de voyage",
    agenciesTitle: "Un service visas pour votre agence.",
    agenciesBody: "ESSAFARIA accompagne les agences de voyages en Algérie dans le traitement des demandes visa. Préparez vos dossiers, transmettez les pièces et suivez leur avancement depuis votre espace partenaire sécurisé.",
    applyTitle: "Demander un accès partenaire",
    applyBody: "Indiquez le nom de votre agence et vos coordonnées. Notre équipe examine votre demande et vous contacte si des informations complémentaires sont nécessaires.",
    review: "L’accès agence est accordé après examen.",
    aboutTitle: "À propos d’ESSAFARIA Travel",
    aboutBody: "Basée à Alger, ESSAFARIA TRAVEL accompagne les agences de voyages dans les démarches de visa de leurs voyageurs grâce à un service professionnel B2B.",
    legalMissing: "Ces informations sont en attente de publication. Contactez ESSAFARIA pour obtenir le document approuvé avant de l’accepter.",
    updated: "Date d’entrée en vigueur",
  },
  ar: {
    eyebrow: "لوكالات السفر",
    hero: "منصة التأشيرات المهنية لوكالات السفر.",
    intro: "لوكالات السفر في الجزائر: افتحوا ملف المسافر، وأرسلوا وثائقه للمراجعة، وتابعوا طلب التأشيرة من مساحة وكالتكم.",
    partner: "كن شريكاً",
    signIn: "دخول الوكالة",
    illustration: "صورة توضيحية للسفر",
    agenciesTitle: "خدمة التأشيرات لوكالتكم.",
    agenciesBody: "ترافق ESSAFARIA وكالات السفر في الجزائر في معالجة طلبات التأشيرات. يمكنكم إعداد الملفات وإرسال المستندات المطلوبة ومتابعة الطلبات عبر مساحة شركاء آمنة.",
    applyTitle: "طلب الدخول كشريك",
    applyBody: "أخبرونا باسم وكالتكم وبيانات التواصل. يراجع فريقنا طلبكم ويتواصل معكم عند الحاجة إلى معلومات إضافية.",
    review: "يُمنح دخول الوكالة بعد المراجعة.",
    aboutTitle: "عن ESSAFARIA Travel",
    aboutBody: "تدعم ESSAFARIA TRAVEL، ومقرها الجزائر العاصمة، وكالات السفر في إعداد طلبات التأشيرة لمسافريها عبر خدمة مهنية B2B.",
    legalMissing: "هذه المعلومات تنتظر النشر. يرجى التواصل مع ESSAFARIA للحصول على الوثيقة المعتمدة قبل قبولها.",
    updated: "تاريخ السريان",
  },
} as const;
const legalChanged = {
  en: "The legal documents have changed. Refresh this page and review them before submitting.",
  fr: "Les documents juridiques ont changé. Actualisez cette page et relisez-les avant l’envoi.",
  ar: "تغيّرت الوثائق القانونية. حدّث هذه الصفحة وراجعها قبل الإرسال.",
};
export function publicBrandCopy(locale: UiLocale) {
  return { ...copies[locale], legalChanged: legalChanged[locale] };
}
