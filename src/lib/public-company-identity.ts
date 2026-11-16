import type { UiLocale } from "@/lib/ui-i18n";

/** Public facts about the operator, not the visa-services catalogue. */
export const PUBLIC_COMPANY_FACTS = {
  operatorName: "ESSAFARIA TRAVEL",
  tourismLicence: "2220",
  iataNumber: "03217141",
  website: "https://www.essafariavoyages.com/",
  fallbackAddress: "Lot Makoudi Ahmed N°70, B1 El Alia, Oued Smar, Alger, Algeria",
} as const;

export const PUBLIC_COMPANY_COPY: Record<UiLocale, {
  heading: string;
  introduction: string;
  companyLabel: string;
  licenceLabel: string;
  iataLabel: string;
  addressLabel: string;
  websiteLabel: string;
  websiteText: string;
  accreditationNote: string;
  methodTitle: string;
  methodBody: string;
  methodLink: string;
}> = {
  en: {
    heading: "The Algerian travel agency behind VISA OS",
    introduction: "VISA OS is operated by ESSAFARIA TRAVEL in Algiers. Our team coordinates visa and eVisa case preparation with approved travel-agency partners and follows up on documents within the secure workspace.",
    companyLabel: "Operator",
    licenceLabel: "Tourism licence",
    iataLabel: "IATA accreditation number",
    addressLabel: "Office",
    websiteLabel: "Company website",
    websiteText: "Visit ESSAFARIA TRAVEL",
    accreditationNote: "IATA accreditation concerns airline ticketing, not the issuance or approval of visas. Visa decisions remain with the relevant authorities.",
    methodTitle: "A documented process, not a visa guarantee",
    methodBody: "Our partner guide explains the agency account review, preparation of supporting documents, ESSAFARIA’s file checks and the status information available in the secure portal. Each visa decision belongs to the competent authority.",
    methodLink: "See the agency workflow",
  },
  fr: {
    heading: "Une agence de voyages algérienne derrière VISA OS",
    introduction: "ESSAFARIA TRAVEL, basée à Alger, exploite VISA OS pour ses agences partenaires approuvées. Notre équipe coordonne la préparation des dossiers de visa et d’eVisa, contrôle les documents transmis et accompagne le suivi dans l’espace professionnel sécurisé.",
    companyLabel: "Société exploitante",
    licenceLabel: "Licence touristique",
    iataLabel: "Numéro d’accréditation IATA",
    addressLabel: "Bureau",
    websiteLabel: "Site de l’agence",
    websiteText: "Découvrir ESSAFARIA TRAVEL",
    accreditationNote: "L’accréditation IATA concerne la billetterie aérienne, pas la délivrance de visas. Les décisions de visa relèvent exclusivement des autorités compétentes.",
    methodTitle: "Une méthode expliquée, sans promesse de visa",
    methodBody: "Notre guide partenaires décrit la validation des comptes agences, la préparation des justificatifs, les contrôles effectués par ESSAFARIA et les informations de suivi accessibles dans le portail sécurisé. La décision de visa relève des autorités compétentes.",
    methodLink: "Voir le parcours agence",
  },
  ar: {
    heading: "وكالة سفر جزائرية تدير منصة VISA OS",
    introduction: "تدير ESSAFARIA TRAVEL، ومقرها الجزائر العاصمة، منصة VISA OS لوكالات السفر الشريكة المعتمدة. يتولى فريقنا تنسيق إعداد ملفات التأشيرات الإلكترونية والتأشيرات الأخرى ومراجعة الوثائق ومتابعة الطلبات في المساحة المهنية الآمنة.",
    companyLabel: "الشركة المشغّلة",
    licenceLabel: "رخصة السياحة",
    iataLabel: "رقم اعتماد إياتا",
    addressLabel: "المكتب",
    websiteLabel: "الموقع الرسمي للوكالة",
    websiteText: "زيارة موقع ESSAFARIA TRAVEL",
    accreditationNote: "يرتبط اعتماد إياتا بإصدار تذاكر الطيران، ولا يعني صلاحية إصدار التأشيرات أو الموافقة عليها. قرار التأشيرة يعود إلى السلطات المختصة.",
    methodTitle: "إجراءات واضحة من دون ضمان منح التأشيرة",
    methodBody: "يشرح دليل الشركاء مراجعة طلبات حسابات الوكالات، وإعداد الوثائق، والتحقق من الملفات لدى فريق ESSAFARIA، ومعلومات المتابعة المتاحة عبر البوابة الآمنة. ويبقى قرار منح التأشيرة من اختصاص السلطات المعنية.",
    methodLink: "اطّلعوا على مسار عمل الوكالات",
  },
};
