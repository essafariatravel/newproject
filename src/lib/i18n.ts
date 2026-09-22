/**
 * Registration experience internationalization (Phase 2).
 *
 * Scoped, deliberately dependency-free i18n for the public agency
 * registration + account activation flow: EN / FR / AR (RTL).
 * Everything the applicant sees — labels, instructions, validation,
 * consent, confirmation — comes from this dictionary, locale-resolved
 * server-side via `?lang=` (persisted in the `evos_reg_locale` cookie).
 */

export const REGISTRATION_LOCALES = ["en", "fr", "ar"] as const;
export type RegistrationLocale = (typeof REGISTRATION_LOCALES)[number];
export const DEFAULT_REGISTRATION_LOCALE: RegistrationLocale = "en";
export const REGISTRATION_LOCALE_COOKIE = "evos_reg_locale";

export function isRegistrationLocale(v: unknown): v is RegistrationLocale {
  return typeof v === "string" && (REGISTRATION_LOCALES as readonly string[]).includes(v);
}

export function resolveLocale(v: unknown): RegistrationLocale {
  return isRegistrationLocale(v) ? v : DEFAULT_REGISTRATION_LOCALE;
}

export function isRtl(locale: RegistrationLocale): boolean {
  return locale === "ar";
}

export const LOCALE_NAMES: Record<RegistrationLocale, string> = {
  en: "English",
  fr: "Français",
  ar: "العربية",
};

/** Localized CTA reused by header / homepage / B2B surfaces. */
export const REGISTER_CTA: Record<RegistrationLocale, string> = {
  en: "Register your Agency",
  fr: "Inscrire votre agence",
  ar: "سجّل وكالتك",
};

export interface RegistrationCopy {
  dir: "ltr" | "rtl";
  metaTitle: string;
  kicker: string;
  title: string;
  subtitle: string;
  noticeTitle: string;
  noticeBody: string;
  reviewNote: string;
  languageLabel: string;
  sections: {
    company: { title: string; hint: string };
    contact: { title: string; hint: string };
    business: { title: string; hint: string };
    documents: { title: string; hint: string };
    consent: { title: string; hint: string };
  };
  fields: Record<string, { label: string; placeholder?: string; optional?: string }>;
  businessTypes: Record<string, string>;
  monthlyVolumes: Array<{ value: string; label: string }>;
  docCategories: Record<string, { label: string; hint: string }>;
  documentsRules: string;
  consent: { terms: string; privacy: string; accuracy: string };
  termsLink: string;
  privacyLink: string;
  submitLabel: string;
  submitPending: string;
  alreadyPartner: string;
  signIn: string;
  errors: {
    required: string;
    invalidEmail: string;
    invalidWebsite: string;
    tooLong: string;
    tooShort: string;
    invalidChoice: string;
    consentRequired: string;
    fileTooLarge: string;
    fileType: string;
    fileContent: string;
    fileName: string;
    duplicate: string;
    rateLimited: string;
    spamDetected: string;
    generic: string;
    tooFast: string;
  };
  success: {
    kicker: string;
    title: string;
    body: string;
    referenceLabel: string;
    noReference: string;
    nextTitle: string;
    nextSteps: string[];
    backHome: string;
  };
  activation: {
    title: string;
    subtitle: string;
    passwordLabel: string;
    confirmLabel: string;
    passwordHint: string;
    submitLabel: string;
    submitPending: string;
    invalidTitle: string;
    invalidBody: string;
    passwordMismatch: string;
    passwordTooShort: string;
    welcomeName: string;
    backToLogin: string;
  };
}

const en: RegistrationCopy = {
  dir: "ltr",
  metaTitle: "Register your Agency — ESSAFARIA TRAVEL",
  kicker: "B2B Partnership Application",
  title: "Register your Agency",
  subtitle:
    "Apply for partner access to ESSAFARIA VISA OS — the professional visa operations platform for travel agencies, tour operators, wholesalers and corporate travel teams.",
  noticeTitle: "This is an application for partnership",
  noticeBody:
    "Submitting this form does not create an account and does not guarantee access. Every application is reviewed individually by ESSAFARIA TRAVEL, and portal access is activated only after approval.",
  reviewNote:
    "Our partnerships team typically reviews complete applications within 1–2 business days. Company documents accelerate verification.",
  languageLabel: "Language",
  sections: {
    company: { title: "Company", hint: "Legal information about your business, as registered." },
    contact: { title: "Primary contact", hint: "The person authorized to represent this agency." },
    business: { title: "Business profile", hint: "Help us understand your activity and volumes." },
    documents: {
      title: "Company documents",
      hint: "Optional at this stage, but strongly recommended. Files are stored privately and reviewed only by authorized ESSAFARIA staff.",
    },
    consent: { title: "Consent", hint: "Please confirm each statement to submit your application." },
  },
  fields: {
    legalName: { label: "Legal company name", placeholder: "Horizon Voyages SARL" },
    tradingName: { label: "Commercial / trading name", placeholder: "Horizon Voyages", optional: "optional" },
    country: { label: "Country", placeholder: "Algeria" },
    region: { label: "Wilaya / Region", placeholder: "Alger", optional: "optional" },
    city: { label: "City", placeholder: "Algiers" },
    addressLine: { label: "Full address", placeholder: "12 Rue Didouche Mourad" },
    phone: { label: "Business phone", placeholder: "+213 21 00 00 00" },
    email: { label: "Professional email", placeholder: "contact@youragency.com" },
    website: { label: "Website", placeholder: "https://www.youragency.com", optional: "optional" },
    commercialRegistrationNumber: { label: "Commercial registration number", placeholder: "RC 12/3456789" },
    taxId: { label: "Tax / fiscal identification", placeholder: "NIF 012345678901234", optional: "where applicable" },
    licenceNumber: { label: "Travel agency licence / accreditation", placeholder: "Licence n° …", optional: "where applicable" },
    contactFirstName: { label: "First name", placeholder: "Amine" },
    contactLastName: { label: "Last name", placeholder: "Benali" },
    contactPosition: { label: "Position", placeholder: "General Manager" },
    contactEmail: { label: "Professional email", placeholder: "amine@youragency.com" },
    contactPhone: { label: "Phone / WhatsApp", placeholder: "+213 550 00 00 00" },
    businessType: { label: "Business type" },
    monthlyVolume: { label: "Estimated monthly visa volume", optional: "optional" },
    mainMarkets: { label: "Main destinations / markets", placeholder: "Schengen, UK, Canada…", optional: "optional" },
    message: { label: "Additional message", placeholder: "Anything we should know about your agency…", optional: "optional" },
  },
  businessTypes: {
    TRAVEL_AGENCY: "Travel Agency",
    TOUR_OPERATOR: "Tour Operator",
    VISA_AGENCY: "Visa Agency",
    CORPORATE_TRAVEL: "Corporate Travel",
    WHOLESALER: "Wholesaler",
    OTHER: "Other",
  },
  monthlyVolumes: [
    { value: "1-10", label: "1 – 10 applications" },
    { value: "11-50", label: "11 – 50 applications" },
    { value: "51-200", label: "51 – 200 applications" },
    { value: "200+", label: "200+ applications" },
  ],
  docCategories: {
    COMMERCIAL_REGISTRATION: { label: "Commercial registration", hint: "Registre de commerce / CR extract" },
    AGENCY_LICENCE: { label: "Agency licence / accreditation", hint: "Travel agency licence or IATA accreditation" },
    TAX_DOCUMENT: { label: "Tax / company document", hint: "NIF / fiscal identification document" },
    OTHER: { label: "Other supporting document", hint: "Any document supporting your application" },
  },
  documentsRules: "PDF, JPEG, PNG or WebP · maximum 2 MB per file",
  consent: {
    terms: "I have read and accept the Terms of Service.",
    privacy: "I acknowledge the Privacy Notice and how ESSAFARIA processes company and personal data.",
    accuracy:
      "I confirm I am authorized to submit this application and that all company information provided is accurate.",
  },
  termsLink: "Terms of Service",
  privacyLink: "Privacy Notice",
  submitLabel: "Submit application for review",
  submitPending: "Submitting securely…",
  alreadyPartner: "Already a partner agency?",
  signIn: "Sign in to your portal",
  errors: {
    required: "This field is required.",
    invalidEmail: "Enter a valid professional email address.",
    invalidWebsite: "Enter a valid website address (for example https://www.youragency.com).",
    tooLong: "This field is too long.",
    tooShort: "This field is too short.",
    invalidChoice: "Choose a valid option.",
    consentRequired: "You must confirm this statement to submit your application.",
    fileTooLarge: "Files must be 2 MB or smaller.",
    fileType: "Allowed formats: PDF, JPEG, PNG or WebP.",
    fileContent: "The file content does not match its declared format.",
    fileName: "Invalid file name.",
    duplicate:
      "An application or account already exists for this email or company. If you believe this is an error, contact ESSAFARIA.",
    rateLimited: "Too many attempts. Please wait a while before submitting again.",
    spamDetected: "Your submission could not be accepted. Please contact ESSAFARIA directly.",
    generic: "Something went wrong. Please try again.",
    tooFast: "Please take a moment to review the form before submitting.",
  },
  success: {
    kicker: "Application received",
    title: "Thank you — your registration request has been received.",
    body: "Your agency registration request has been received. ESSAFARIA TRAVEL will review your information before access to ESSAFARIA VISA OS is activated.",
    referenceLabel: "Application reference",
    noReference: "Your application has been received.",
    nextTitle: "What happens next",
    nextSteps: [
      "Our partnerships team reviews your company information and documents.",
      "We may contact your primary contact if additional information is required.",
      "If approved, your agency workspace is created and your administrator receives a secure activation link.",
    ],
    backHome: "Back to the homepage",
  },
  activation: {
    title: "Activate your agency account",
    subtitle: "Set the password for your administrator account to access the ESSAFARIA Agency Portal.",
    passwordLabel: "New password",
    confirmLabel: "Confirm password",
    passwordHint: "At least 10 characters.",
    submitLabel: "Set password & sign in",
    submitPending: "Activating…",
    invalidTitle: "This activation link is invalid or has expired",
    invalidBody:
      "Activation links are single-use and expire after 72 hours. Please contact ESSAFARIA to receive a new link.",
    passwordMismatch: "Passwords do not match.",
    passwordTooShort: "Password must be at least 10 characters.",
    welcomeName: "Account",
    backToLogin: "Back to sign in",
  },
};

const fr: RegistrationCopy = {
  dir: "ltr",
  metaTitle: "Inscrire votre agence — ESSAFARIA TRAVEL",
  kicker: "Demande de partenariat B2B",
  title: "Inscrire votre agence",
  subtitle:
    "Demandez un accès partenaire à ESSAFARIA VISA OS — la plateforme professionnelle d'opérations visa pour les agences de voyage, tour-opérateurs, grossistes et équipes de voyage d'affaires.",
  noticeTitle: "Il s'agit d'une demande de partenariat",
  noticeBody:
    "L'envoi de ce formulaire ne crée pas de compte et ne garantit pas l'accès. Chaque demande est examinée individuellement par ESSAFARIA TRAVEL et l'accès au portail n'est activé qu'après approbation.",
  reviewNote:
    "Notre équipe partenariats examine généralement les dossiers complets sous 1 à 2 jours ouvrés. Les documents de l'entreprise accélèrent la vérification.",
  languageLabel: "Langue",
  sections: {
    company: { title: "Entreprise", hint: "Informations légales de votre société, telles qu'enregistrées." },
    contact: { title: "Contact principal", hint: "La personne habilitée à représenter cette agence." },
    business: { title: "Profil d'activité", hint: "Aidez-nous à comprendre votre activité et vos volumes." },
    documents: {
      title: "Documents de l'entreprise",
      hint: "Facultatif à cette étape, mais fortement recommandé. Les fichiers sont conservés en espace privé et consultés uniquement par le personnel ESSAFARIA autorisé.",
    },
    consent: { title: "Consentement", hint: "Veuillez confirmer chaque déclaration pour envoyer votre demande." },
  },
  fields: {
    legalName: { label: "Raison sociale", placeholder: "Horizon Voyages SARL" },
    tradingName: { label: "Nom commercial / enseigne", placeholder: "Horizon Voyages", optional: "facultatif" },
    country: { label: "Pays", placeholder: "Algérie" },
    region: { label: "Wilaya / Région", placeholder: "Alger", optional: "facultatif" },
    city: { label: "Ville", placeholder: "Alger" },
    addressLine: { label: "Adresse complète", placeholder: "12 Rue Didouche Mourad" },
    phone: { label: "Téléphone professionnel", placeholder: "+213 21 00 00 00" },
    email: { label: "Email professionnel", placeholder: "contact@votreagence.com" },
    website: { label: "Site web", placeholder: "https://www.votreagence.com", optional: "facultatif" },
    commercialRegistrationNumber: { label: "Numéro de registre de commerce", placeholder: "RC 12/3456789" },
    taxId: { label: "Identification fiscale", placeholder: "NIF 012345678901234", optional: "le cas échéant" },
    licenceNumber: { label: "Licence / accréditation d'agence de voyage", placeholder: "Licence n° …", optional: "le cas échéant" },
    contactFirstName: { label: "Prénom", placeholder: "Amine" },
    contactLastName: { label: "Nom", placeholder: "Benali" },
    contactPosition: { label: "Fonction", placeholder: "Directeur Général" },
    contactEmail: { label: "Email professionnel", placeholder: "amine@votreagence.com" },
    contactPhone: { label: "Téléphone / WhatsApp", placeholder: "+213 550 00 00 00" },
    businessType: { label: "Type d'activité" },
    monthlyVolume: { label: "Volume mensuel de visas estimé", optional: "facultatif" },
    mainMarkets: { label: "Destinations / marchés principaux", placeholder: "Schengen, Royaume-Uni, Canada…", optional: "facultatif" },
    message: { label: "Message complémentaire", placeholder: "Ce que nous devrions savoir sur votre agence…", optional: "facultatif" },
  },
  businessTypes: {
    TRAVEL_AGENCY: "Agence de voyage",
    TOUR_OPERATOR: "Tour-opérateur",
    VISA_AGENCY: "Agence de visas",
    CORPORATE_TRAVEL: "Voyage d'affaires",
    WHOLESALER: "Grossiste",
    OTHER: "Autre",
  },
  monthlyVolumes: [
    { value: "1-10", label: "1 – 10 demandes" },
    { value: "11-50", label: "11 – 50 demandes" },
    { value: "51-200", label: "51 – 200 demandes" },
    { value: "200+", label: "200+ demandes" },
  ],
  docCategories: {
    COMMERCIAL_REGISTRATION: { label: "Registre de commerce", hint: "Extrait RC / registre de commerce" },
    AGENCY_LICENCE: { label: "Licence / accréditation d'agence", hint: "Licence d'agence de voyage ou accréditation IATA" },
    TAX_DOCUMENT: { label: "Document fiscal / société", hint: "NIF / document d'identification fiscale" },
    OTHER: { label: "Autre document justificatif", hint: "Tout document appuyant votre demande" },
  },
  documentsRules: "PDF, JPEG, PNG ou WebP · 2 Mo maximum par fichier",
  consent: {
    terms: "J'ai lu et j'accepte les Conditions Générales d'Utilisation.",
    privacy: "Je reconnais avoir pris connaissance de la Politique de Confidentialité et du traitement des données par ESSAFARIA.",
    accuracy:
      "Je confirme être habilité(e) à soumettre cette demande et que toutes les informations fournies sont exactes.",
  },
  termsLink: "Conditions Générales d'Utilisation",
  privacyLink: "Politique de Confidentialité",
  submitLabel: "Soumettre la demande pour examen",
  submitPending: "Envoi sécurisé en cours…",
  alreadyPartner: "Déjà agence partenaire ?",
  signIn: "Connectez-vous à votre portail",
  errors: {
    required: "Ce champ est obligatoire.",
    invalidEmail: "Saisissez une adresse email professionnelle valide.",
    invalidWebsite: "Saisissez une adresse de site web valide (ex. https://www.votreagence.com).",
    tooLong: "Ce champ est trop long.",
    tooShort: "Ce champ est trop court.",
    invalidChoice: "Choisissez une option valide.",
    consentRequired: "Vous devez confirmer cette déclaration pour soumettre votre demande.",
    fileTooLarge: "Les fichiers doivent faire 2 Mo maximum.",
    fileType: "Formats acceptés : PDF, JPEG, PNG ou WebP.",
    fileContent: "Le contenu du fichier ne correspond pas au format déclaré.",
    fileName: "Nom de fichier invalide.",
    duplicate:
      "Une demande ou un compte existe déjà pour cet email ou cette société. Si vous pensez qu'il s'agit d'une erreur, contactez ESSAFARIA.",
    rateLimited: "Trop de tentatives. Veuillez patienter avant de soumettre à nouveau.",
    spamDetected: "Votre envoi n'a pas pu être accepté. Veuillez contacter ESSAFARIA directement.",
    generic: "Une erreur est survenue. Veuillez réessayer.",
    tooFast: "Veuillez prendre un moment pour vérifier le formulaire avant l'envoi.",
  },
  success: {
    kicker: "Demande reçue",
    title: "Merci — votre demande d'inscription a bien été reçue.",
    body: "Votre demande d'inscription d'agence a bien été reçue. ESSAFARIA TRAVEL examinera vos informations avant que l'accès à ESSAFARIA VISA OS ne soit activé.",
    referenceLabel: "Référence de la demande",
    noReference: "Votre demande a bien été reçue.",
    nextTitle: "Prochaines étapes",
    nextSteps: [
      "Notre équipe partenariats examine les informations et documents de votre société.",
      "Nous pouvons contacter votre contact principal si des informations complémentaires sont nécessaires.",
      "En cas d'approbation, l'espace de votre agence est créé et votre administrateur reçoit un lien d'activation sécurisé.",
    ],
    backHome: "Retour à l'accueil",
  },
  activation: {
    title: "Activez votre compte agence",
    subtitle: "Définissez le mot de passe de votre compte administrateur pour accéder au Portail Agence ESSAFARIA.",
    passwordLabel: "Nouveau mot de passe",
    confirmLabel: "Confirmer le mot de passe",
    passwordHint: "10 caractères minimum.",
    submitLabel: "Définir le mot de passe et me connecter",
    submitPending: "Activation…",
    invalidTitle: "Ce lien d'activation est invalide ou a expiré",
    invalidBody:
      "Les liens d'activation sont à usage unique et expirent après 72 heures. Veuillez contacter ESSAFARIA pour recevoir un nouveau lien.",
    passwordMismatch: "Les mots de passe ne correspondent pas.",
    passwordTooShort: "Le mot de passe doit contenir au moins 10 caractères.",
    welcomeName: "Compte",
    backToLogin: "Retour à la connexion",
  },
};

const ar: RegistrationCopy = {
  dir: "rtl",
  metaTitle: "سجّل وكالتك — ESSAFARIA TRAVEL",
  kicker: "طلب شراكة بين الشركات",
  title: "سجّل وكالتك",
  subtitle:
    "قدّم طلب الحصول على صلاحية الدخول إلى ESSAFARIA VISA OS — المنصة الاحترافية لإدارة عمليات التأشيرات لوكالات السفر ومنظمي الرحلات وموزّعي الجملة وفرق سفر الأعمال.",
  noticeTitle: "هذا النموذج طلب شراكة",
  noticeBody:
    "إرسال هذا النموذج لا يؤدي إلى إنشاء حساب ولا يضمن الحصول على الوصول. تتم مراجعة كل طلب على حدة من طرف ESSAFARIA TRAVEL، ولا يتم تفعيل الدخول إلى البوابة إلا بعد الموافقة.",
  reviewNote:
    "يراجع فريق الشراكات الطلبات المكتملة عادةً خلال يوم إلى يومي عمل. إرفاق وثائق الشركة يُسرّع عملية التحقق.",
  languageLabel: "اللغة",
  sections: {
    company: { title: "الشركة", hint: "البيانات القانونية لشركتكم كما هي مسجلة رسمياً." },
    contact: { title: "جهة الاتصال الرئيسية", hint: "الشخص المخوّل بتمثيل هذه الوكالة." },
    business: { title: "الملف التجاري", hint: "ساعدونا على فهم نشاطكم وحجم أعمالكم." },
    documents: {
      title: "وثائق الشركة",
      hint: "اختياري في هذه المرحلة لكنه موصى به بشدة. تُحفظ الملفات بشكل خاص وآمن ولا يطّلع عليها إلا موظفو ESSAFARIA المخوّلون.",
    },
    consent: { title: "الموافقة والإقرار", hint: "يرجى تأكيد كل بيان لإرسال طلبكم." },
  },
  fields: {
    legalName: { label: "الاسم القانوني للشركة", placeholder: "شركة آفاق للسياحة" },
    tradingName: { label: "الاسم التجاري", placeholder: "آفاق للأسفار", optional: "اختياري" },
    country: { label: "البلد", placeholder: "الجزائر" },
    region: { label: "الولاية / المنطقة", placeholder: "الجزائر", optional: "اختياري" },
    city: { label: "المدينة", placeholder: "الجزائر العاصمة" },
    addressLine: { label: "العنوان الكامل", placeholder: "12 شارع ديدوش مراد" },
    phone: { label: "هاتف الشركة", placeholder: "+213 21 00 00 00" },
    email: { label: "البريد الإلكتروني المهني", placeholder: "contact@youragency.com" },
    website: { label: "الموقع الإلكتروني", placeholder: "https://www.youragency.com", optional: "اختياري" },
    commercialRegistrationNumber: { label: "رقم السجل التجاري", placeholder: "RC 12/3456789" },
    taxId: { label: "رقم التعريف الجبائي", placeholder: "NIF 012345678901234", optional: "عند الاقتضاء" },
    licenceNumber: { label: "رقم رخصة / اعتماد وكالة السفر", placeholder: "رخصة رقم …", optional: "عند الاقتضاء" },
    contactFirstName: { label: "الاسم", placeholder: "أمين" },
    contactLastName: { label: "اللقب", placeholder: "بن علي" },
    contactPosition: { label: "المنصب", placeholder: "المدير العام" },
    contactEmail: { label: "البريد الإلكتروني المهني", placeholder: "amine@youragency.com" },
    contactPhone: { label: "الهاتف / واتساب", placeholder: "+213 550 00 00 00" },
    businessType: { label: "نوع النشاط" },
    monthlyVolume: { label: "حجم طلبات التأشيرة الشهري التقديري", optional: "اختياري" },
    mainMarkets: { label: "الوجهات / الأسواق الرئيسية", placeholder: "شنغن، المملكة المتحدة، كندا…", optional: "اختياري" },
    message: { label: "رسالة إضافية", placeholder: "أي معلومات ترغبون في إعلامنا بها عن وكالتكم…", optional: "اختياري" },
  },
  businessTypes: {
    TRAVEL_AGENCY: "وكالة سفر",
    TOUR_OPERATOR: "منظم رحلات",
    VISA_AGENCY: "وكالة تأشيرات",
    CORPORATE_TRAVEL: "سفر الأعمال للشركات",
    WHOLESALER: "موزّع جملة",
    OTHER: "أخرى",
  },
  monthlyVolumes: [
    { value: "1-10", label: "1 – 10 طلبات" },
    { value: "11-50", label: "11 – 50 طلباً" },
    { value: "51-200", label: "51 – 200 طلب" },
    { value: "200+", label: "أكثر من 200 طلب" },
  ],
  docCategories: {
    COMMERCIAL_REGISTRATION: { label: "السجل التجاري", hint: "مستخرج السجل التجاري" },
    AGENCY_LICENCE: { label: "رخصة / اعتماد الوكالة", hint: "رخصة وكالة سفر أو اعتماد IATA" },
    TAX_DOCUMENT: { label: "وثيقة جبائية / وثيقة الشركة", hint: "رقم التعريف الجبائي NIF" },
    OTHER: { label: "وثيقة داعمة أخرى", hint: "أي وثيقة تدعم طلبكم" },
  },
  documentsRules: "PDF أو JPEG أو PNG أو WebP · 2 ميغابايت كحد أقصى لكل ملف",
  consent: {
    terms: "لقد اطلعت على شروط الخدمة وأوافق عليها.",
    privacy: "أُقرّ باطلاعي على إشعار الخصوصية وكيفية معالجة ESSAFARIA لبيانات الشركة والبيانات الشخصية.",
    accuracy: "أؤكد أنني مخوّل بتقديم هذا الطلب وأن جميع بيانات الشركة المقدَّمة صحيحة.",
  },
  termsLink: "شروط الخدمة",
  privacyLink: "إشعار الخصوصية",
  submitLabel: "إرسال الطلب للمراجعة",
  submitPending: "جارٍ الإرسال الآمن…",
  alreadyPartner: "هل أنتم وكالة شريكة بالفعل؟",
  signIn: "تسجيل الدخول إلى البوابة",
  errors: {
    required: "هذا الحقل إلزامي.",
    invalidEmail: "يرجى إدخال بريد إلكتروني مهني صحيح.",
    invalidWebsite: "يرجى إدخال عنوان موقع إلكتروني صحيح (مثال: https://www.youragency.com).",
    tooLong: "هذا الحقل طويل جداً.",
    tooShort: "هذا الحقل قصير جداً.",
    invalidChoice: "يرجى اختيار خيار صحيح.",
    consentRequired: "يجب تأكيد هذا البيان لتقديم طلبكم.",
    fileTooLarge: "يجب ألّا يتجاوز حجم الملف 2 ميغابايت.",
    fileType: "الصيغ المسموح بها: PDF أو JPEG أو PNG أو WebP.",
    fileContent: "محتوى الملف لا يطابق الصيغة المُعلنة.",
    fileName: "اسم الملف غير صالح.",
    duplicate:
      "يوجد طلب أو حساب مسجَّل مسبقاً لهذا البريد الإلكتروني أو لهذه الشركة. إذا كنتم تعتقدون أن هناك خطأ، يرجى التواصل مع ESSAFARIA.",
    rateLimited: "محاولات كثيرة جداً. يرجى الانتظار قليلاً قبل إعادة الإرسال.",
    spamDetected: "تعذّر قبول طلبكم. يرجى التواصل مع ESSAFARIA مباشرةً.",
    generic: "حدث خطأ ما. يرجى المحاولة مرة أخرى.",
    tooFast: "يرجى تخصيص لحظة لمراجعة النموذج قبل الإرسال.",
  },
  success: {
    kicker: "تم استلام الطلب",
    title: "شكراً — تم استلام طلب تسجيل وكالتكم.",
    body: "تم استلام طلب تسجيل وكالتكم. ستقوم ESSAFARIA TRAVEL بمراجعة بياناتكم قبل تفعيل الدخول إلى ESSAFARIA VISA OS.",
    referenceLabel: "مرجع الطلب",
    noReference: "تم استلام طلبكم.",
    nextTitle: "الخطوات التالية",
    nextSteps: [
      "يراجع فريق الشراكات بيانات شركتكم والوثائق المرفقة.",
      "قد نتواصل مع جهة الاتصال الرئيسية إذا لزمت معلومات إضافية.",
      "عند الموافقة، يتم إنشاء مساحة عمل وكالتكم ويتلقى المسؤول رابط تفعيل آمن.",
    ],
    backHome: "العودة إلى الصفحة الرئيسية",
  },
  activation: {
    title: "تفعيل حساب وكالتكم",
    subtitle: "عيّن كلمة المرور لحساب المسؤول للوصول إلى بوابة وكالات ESSAFARIA.",
    passwordLabel: "كلمة المرور الجديدة",
    confirmLabel: "تأكيد كلمة المرور",
    passwordHint: "10 أحرف على الأقل.",
    submitLabel: "تعيين كلمة المرور وتسجيل الدخول",
    submitPending: "جارٍ التفعيل…",
    invalidTitle: "رابط التفعيل غير صالح أو منتهي الصلاحية",
    invalidBody:
      "روابط التفعيل للاستعمال مرة واحدة وتنتهي صلاحيتها بعد 72 ساعة. يرجى التواصل مع ESSAFARIA للحصول على رابط جديد.",
    passwordMismatch: "كلمتا المرور غير متطابقتين.",
    passwordTooShort: "يجب أن تتكون كلمة المرور من 10 أحرف على الأقل.",
    welcomeName: "الحساب",
    backToLogin: "العودة إلى تسجيل الدخول",
  },
};

const DICTS: Record<RegistrationLocale, RegistrationCopy> = { en, fr, ar };

export function registrationCopy(locale: RegistrationLocale): RegistrationCopy {
  return DICTS[locale] ?? en;
}
